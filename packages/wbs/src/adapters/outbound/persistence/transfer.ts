import { createHash } from "node:crypto";
import type { Database, Sql, SqlRow } from "@line_bot_v1/platform/postgres";
import { isRecord, numberValue, numericValue, stringValue } from "@line_bot_v1/platform/validation";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type { WbsScopeTransfer } from "../../../contracts/dto/transfer.js";
import type { WbsTransferScopeReaders } from "../../../contracts/output/transfer.js";
import type {
  WbsScopeTransferStore,
  WbsTransferCancelTransaction,
  WbsTransferExecutionTransaction,
  WbsTransferRequestTransaction,
} from "../../../contracts/repositories/transfer.js";
import { WbsError } from "../../../domain/document.js";
import type { WbsTransferDependentCounts, WbsTransferSnapshot } from "../../../domain/transfer.js";

function transfer(row: SqlRow): WbsScopeTransfer {
  const state = stringValue(row.state);
  if (state !== "REQUESTED" && state !== "ACTIVE" && state !== "CANCELLED")
    throw new WbsError(503, "WBS 移轉狀態無法讀取。");
  return {
    id: stringValue(row.id),
    repositoryId: stringValue(row.repository_id),
    projectId: stringValue(row.project_id),
    actorUserId: stringValue(row.actor_user_id),
    requestId: stringValue(row.request_id),
    state,
    sourceVersion: numberValue(row.source_version),
    sourceHeadRevisionId: stringValue(row.source_head_revision_id),
    revisionCount: numberValue(row.revision_count),
    commandCount: numberValue(row.command_count),
    sourceHash: stringValue(row.source_hash),
    requestedAt: Number(numericValue(row.requested_at)),
    activatedAt: row.activated_at === null ? null : Number(numericValue(row.activated_at)),
    releaseSha: row.release_sha === null ? null : stringValue(row.release_sha),
    cancelledAt: row.cancelled_at === null ? null : Number(numericValue(row.cancelled_at)),
    cancelRequestId: row.cancel_request_id === null ? null : stringValue(row.cancel_request_id),
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value))
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}

async function sourceSnapshot(
  sql: Sql,
  repositoryId: string,
  lockRoot = true,
): Promise<WbsTransferSnapshot> {
  const root = (
    await sql.query(
      `SELECT version,head_revision_id FROM repository_wbs WHERE repository_id=$1${
        lockRoot ? " FOR UPDATE" : ""
      }`,
      [repositoryId],
      (row) => ({
        sourceVersion: numberValue(row.version),
        sourceHeadRevisionId: stringValue(row.head_revision_id),
      }),
    )
  ).rows[0];
  if (!root) throw new WbsError(404, "找不到來源 Repository WBS。");
  const revisions = (
    await sql.query(
      `SELECT id,version,parent_revision_id,actor_user_id,action,document,at
       FROM repository_wbs_revisions WHERE repository_id=$1 ORDER BY version,id`,
      [repositoryId],
    )
  ).rows;
  const commands = (
    await sql.query(
      `SELECT actor_user_id,request_id,fingerprint,revision_id
       FROM repository_wbs_commands WHERE repository_id=$1
       ORDER BY actor_user_id,request_id`,
      [repositoryId],
    )
  ).rows;
  const sourceHash = createHash("sha256")
    .update(
      JSON.stringify(
        canonical({
          repositoryId,
          version: root.sourceVersion,
          headRevisionId: root.sourceHeadRevisionId,
          revisions,
          commands,
        }),
      ),
    )
    .digest("hex");
  return {
    ...root,
    revisionCount: revisions.length,
    commandCount: commands.length,
    sourceHash,
  };
}

function requestMatches(
  previous: WbsScopeTransfer,
  command: {
    transferId: string;
    requestId: string;
    repositoryId: string;
    projectId: string;
    sourceVersion: number;
    sourceHeadRevisionId: string;
  },
) {
  return (
    previous.id === command.transferId &&
    previous.requestId === command.requestId &&
    previous.repositoryId === command.repositoryId &&
    previous.projectId === command.projectId &&
    previous.sourceVersion === command.sourceVersion &&
    previous.sourceHeadRevisionId === command.sourceHeadRevisionId
  );
}

async function dependentCounts(
  sql: Sql,
  readers: WbsTransferScopeReaders,
  actorUserId: string,
  repositoryId: string,
  projectId: string,
): Promise<WbsTransferDependentCounts> {
  const roots = (
    await sql.query(
      `SELECT count(*) AS total_count,
              count(*) FILTER (WHERE repository_id=$1) AS source_count
       FROM repository_wbs`,
      [repositoryId],
      (row) => ({
        total: Number(numericValue(row.total_count)),
        source: Number(numericValue(row.source_count)),
      }),
    )
  ).rows[0];
  const governance = (
    await sql.query(
      `SELECT
         (SELECT count(*) FROM repository_wbs_policies)
         +(SELECT count(*) FROM repository_wbs_governance)
         +(SELECT count(*) FROM repository_wbs_proposals)
         +(SELECT count(*) FROM repository_wbs_proposal_versions)
         +(SELECT count(*) FROM repository_wbs_reviews)
         +(SELECT count(*) FROM repository_wbs_baselines)
         +(SELECT count(*) FROM repository_wbs_governance_commands)
         AS count`,
      [],
      (row) => ({ count: Number(numericValue(row.count)) }),
    )
  ).rows[0];
  const outbox = (
    await sql.query("SELECT count(*) AS count FROM repository_wbs_outbox", [], (row) => ({
      count: Number(numericValue(row.count)),
    }))
  ).rows[0];
  const external = await readers.dependents(actorUserId, repositoryId, projectId);
  return {
    repositoryWbsRows: roots?.total ?? 0,
    sourceRepositoryWbsRows: roots?.source ?? 0,
    governanceRows: governance?.count ?? 0,
    outboxRows: outbox?.count ?? 0,
    actionRows: external.actionRows,
    notificationRows: external.notificationRows,
  };
}

export class PostgresWbsScopeTransferStore implements WbsScopeTransferStore {
  constructor(
    private readonly requestDb: Database,
    private readonly bindReaders: (sql: Sql) => WbsTransferScopeReaders,
    private readonly operatorDb?: Database,
  ) {}

  readActive(transferId: string): Promise<WbsScopeTransfer | null> {
    if (!this.operatorDb)
      throw new WbsError(503, "WBS 移轉 operator database 未設定，不能讀取移轉結果。");
    return this.operatorDb.transaction(async (sql) => {
      const current = (
        await sql.query("SELECT * FROM wbs_scope_transfers WHERE id=$1", [transferId], transfer)
      ).rows[0];
      if (!current || current.state !== "ACTIVE") return null;
      const source = await sourceSnapshot(sql, current.repositoryId, false);
      const targetRoot = (
        await sql.query(
          "SELECT version FROM project_wbs WHERE project_id=$1",
          [current.projectId],
          (row) => ({ version: numberValue(row.version) }),
        )
      ).rows[0];
      const migratedHead = (
        await sql.query(
          `SELECT id FROM project_wbs_revisions
           WHERE project_id=$1 AND version=$2`,
          [current.projectId, current.sourceVersion],
          (row) => ({ id: stringValue(row.id) }),
        )
      ).rows[0];
      const targetRevisions = (
        await sql.query(
          `SELECT id,version,parent_revision_id,actor_user_id,action,document,at
           FROM project_wbs_revisions
           WHERE project_id=$1 AND version<=$2 ORDER BY version,id`,
          [current.projectId, current.sourceVersion],
        )
      ).rows;
      const targetCommands = (
        await sql.query(
          `SELECT actor_user_id,request_id,fingerprint,revision_id
           FROM legacy_wbs_command_evidence
           WHERE project_id=$1 ORDER BY actor_user_id,request_id`,
          [current.projectId],
        )
      ).rows;
      const targetHash = createHash("sha256")
        .update(
          JSON.stringify(
            canonical({
              repositoryId: current.repositoryId,
              version: current.sourceVersion,
              headRevisionId: current.sourceHeadRevisionId,
              revisions: targetRevisions,
              commands: targetCommands,
            }),
          ),
        )
        .digest("hex");
      if (
        source.sourceHash !== current.sourceHash ||
        targetRoot === undefined ||
        targetRoot.version < current.sourceVersion ||
        migratedHead?.id !== current.sourceHeadRevisionId ||
        targetRevisions.length !== current.revisionCount ||
        targetCommands.length !== current.commandCount ||
        targetHash !== current.sourceHash
      )
        throw new WbsError(503, "ACTIVE WBS 移轉的目標歷史或證據無法驗證。");
      return current;
    });
  }

  readCurrent(
    actorUserId: string,
    repositoryId: string,
  ): Promise<
    Readonly<{
      transfer: WbsScopeTransfer | null;
      source: Awaited<ReturnType<WbsTransferScopeReaders["repository"]>>;
    }>
  > {
    return this.requestDb.transaction(async (sql) => {
      const source = await this.bindReaders(sql).repository(actorUserId, repositoryId);
      const current = (
        await sql.query(
          `SELECT * FROM wbs_scope_transfers
           WHERE repository_id=$1 AND actor_user_id=$2 AND state IN ('REQUESTED','ACTIVE')`,
          [repositoryId, actorUserId],
          transfer,
        )
      ).rows[0];
      return { transfer: current ?? null, source };
    });
  }

  request<T>(
    actorUserId: string,
    command: Parameters<WbsScopeTransferStore["request"]>[1],
    requestedAt: number,
    operation: (transaction: WbsTransferRequestTransaction) => Promise<T>,
  ): Promise<T> {
    return this.requestDb.transaction(async (sql) => {
      const readers = this.bindReaders(sql);
      await sql.query("SELECT app_private.lock_governance('exclusive')");
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `wbs-transfer-request:${actorUserId}:${command.requestId}`,
      ]);
      let sourceFacts: Awaited<ReturnType<WbsTransferScopeReaders["repository"]>> | undefined;
      let projectFacts: Awaited<ReturnType<WbsTransferScopeReaders["project"]>> | undefined;
      let snapshot: WbsTransferSnapshot | undefined;
      const transaction: WbsTransferRequestTransaction = {
        replay: async () => {
          const previous = (
            await sql.query(
              "SELECT * FROM wbs_scope_transfers WHERE actor_user_id=$1 AND request_id=$2",
              [actorUserId, command.requestId],
              transfer,
            )
          ).rows[0];
          if (!previous) return null;
          if (!requestMatches(previous, command))
            throw new WbsError(409, "此 requestId 已用於不同的 WBS 移轉。");
          return previous;
        },
        source: async () =>
          (sourceFacts ??= await readers.repository(actorUserId, command.repositoryId)),
        project: async () =>
          (projectFacts ??= await readers.project(actorUserId, command.projectId)),
        snapshot: async () => (snapshot ??= await sourceSnapshot(sql, command.repositoryId)),
        dependents: () =>
          dependentCounts(sql, readers, actorUserId, command.repositoryId, command.projectId),
        destinationEmpty: async () =>
          !(
            await sql.query("SELECT 1 FROM project_wbs WHERE project_id=$1 FOR UPDATE", [
              command.projectId,
            ])
          ).rows.length,
        save: async (current) => {
          try {
            const saved = (
              await sql.query(
                `INSERT INTO wbs_scope_transfers(
                   id,repository_id,project_id,actor_user_id,request_id,
                   source_version,source_head_revision_id,revision_count,command_count,
                   source_hash,requested_at
                 ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                 RETURNING *`,
                [
                  command.transferId,
                  command.repositoryId,
                  command.projectId,
                  actorUserId,
                  command.requestId,
                  current.sourceVersion,
                  current.sourceHeadRevisionId,
                  current.revisionCount,
                  current.commandCount,
                  current.sourceHash,
                  requestedAt,
                ],
                transfer,
              )
            ).rows[0];
            if (!saved) throw new WbsError(503, "WBS 移轉請求保存結果不完整。");
            return saved;
          } catch (error) {
            if (isRecord(error) && error.code === "23505")
              throw new WbsError(409, "來源 Repository 或目標 Project 已有 WBS 移轉。");
            throw error;
          }
        },
      };
      return operation(transaction);
    });
  }

  cancel<T>(
    actorUserId: string,
    command: Parameters<WbsScopeTransferStore["cancel"]>[1],
    cancelledAt: number,
    operation: (transaction: WbsTransferCancelTransaction) => Promise<T>,
  ): Promise<T> {
    return this.requestDb.transaction(async (sql) => {
      const readers = this.bindReaders(sql);
      await sql.query("SELECT app_private.lock_governance('exclusive')");
      const reused = (
        await sql.query(
          "SELECT id FROM wbs_scope_transfers WHERE actor_user_id=$1 AND cancel_request_id=$2",
          [actorUserId, command.requestId],
          (row) => ({ id: stringValue(row.id) }),
        )
      ).rows[0];
      if (reused && reused.id !== command.transferId)
        throw new WbsError(409, "此撤回 requestId 已用於不同的 WBS 移轉。");
      let current: WbsScopeTransfer | undefined;
      const transaction: WbsTransferCancelTransaction = {
        load: async () => {
          const found = (
            await sql.query(
              "SELECT * FROM wbs_scope_transfers WHERE id=$1 AND actor_user_id=$2",
              [command.transferId, actorUserId],
              transfer,
            )
          ).rows[0];
          if (!found) throw new WbsError(404, "找不到可撤回的 WBS 移轉請求。");
          current =
            found.state === "REQUESTED"
              ? (
                  await sql.query(
                    "SELECT * FROM wbs_scope_transfers WHERE id=$1 AND actor_user_id=$2 FOR UPDATE",
                    [command.transferId, actorUserId],
                    transfer,
                  )
                ).rows[0]
              : found;
          if (!current) throw new WbsError(409, "WBS 移轉狀態已變更，不能撤回。");
          return current;
        },
        source: () => readers.repository(actorUserId, command.repositoryId),
        cancel: async (value) => {
          const cancelled = (
            await sql.query(
              `UPDATE wbs_scope_transfers
               SET state='CANCELLED',cancelled_at=$3,cancel_request_id=$4
               WHERE id=$1 AND actor_user_id=$2 AND state='REQUESTED'
               RETURNING *`,
              [value.id, actorUserId, cancelledAt, command.requestId],
              transfer,
            )
          ).rows[0];
          if (!cancelled) throw new WbsError(409, "WBS 移轉狀態已變更，不能撤回。");
          return cancelled;
        },
      };
      return operation(transaction);
    });
  }

  execute<T>(
    transferId: string,
    operation: (transaction: WbsTransferExecutionTransaction) => Promise<T>,
  ): Promise<T> {
    if (!this.operatorDb)
      throw new WbsError(503, "WBS 移轉 operator database 未設定，不能執行移轉。");
    return this.operatorDb.transaction(async (sql) => {
      const readers = this.bindReaders(sql);
      await sql.query("SELECT app_private.lock_governance('exclusive')");
      const transaction: WbsTransferExecutionTransaction = {
        load: async () => {
          const found = (
            await sql.query(
              "SELECT * FROM wbs_scope_transfers WHERE id=$1 FOR UPDATE",
              [transferId],
              transfer,
            )
          ).rows[0];
          if (!found) throw new WbsError(404, "找不到 WBS 移轉請求。");
          return found;
        },
        source: (actorUserId, repositoryId) => readers.repository(actorUserId, repositoryId),
        project: (actorUserId, projectId) => readers.project(actorUserId, projectId),
        snapshot: (repositoryId) => sourceSnapshot(sql, repositoryId),
        dependents: (actorUserId, repositoryId, projectId) =>
          dependentCounts(sql, readers, actorUserId, repositoryId, projectId),
        destinationEmpty: async (projectId) =>
          !(
            await sql.query("SELECT 1 FROM project_wbs WHERE project_id=$1 FOR UPDATE", [projectId])
          ).rows.length,
        activate: async (current, releaseSha, activatedAt) => {
          await sql.query(
            `INSERT INTO project_wbs(project_id,version,head_revision_id)
             VALUES($1,$2,$3)`,
            [current.projectId, current.sourceVersion, current.sourceHeadRevisionId],
          );
          await sql.query(
            `INSERT INTO project_wbs_revisions(
               id,project_id,version,parent_revision_id,actor_user_id,action,document,at
             )
             SELECT id,$2,version,parent_revision_id,actor_user_id,action,document,at
             FROM repository_wbs_revisions WHERE repository_id=$1 ORDER BY version,id`,
            [current.repositoryId, current.projectId],
          );
          await sql.query(
            `INSERT INTO legacy_wbs_command_evidence(
               actor_user_id,request_id,repository_id,fingerprint,revision_id,project_id,transfer_id
             )
             SELECT actor_user_id,request_id,repository_id,fingerprint,revision_id,$2,$3
             FROM repository_wbs_commands WHERE repository_id=$1
             ORDER BY actor_user_id,request_id`,
            [current.repositoryId, current.projectId, current.id],
          );
          const activated = (
            await sql.query(
              `UPDATE wbs_scope_transfers
               SET state='ACTIVE',activated_at=$2,release_sha=$3
               WHERE id=$1 AND state='REQUESTED' RETURNING *`,
              [current.id, activatedAt, releaseSha],
              transfer,
            )
          ).rows[0];
          if (!activated) throw new WbsError(409, "WBS 移轉狀態已變更。");
          return activated;
        },
      };
      return operation(transaction);
    });
  }
}

export async function readRepositoryTransferScope(
  sql: Sql,
  actorUserId: string,
  repositoryId: string,
) {
  const scope = await repositoryContentScope(sql, actorUserId, { repositoryId });
  return {
    repositoryId: scope.repository.id,
    ownerAccountId: scope.ownerAccountId,
    ownerKind: scope.ownerKind,
    visibility: scope.visibility,
    archived: scope.archived,
    permissions: scope.repository.permissions,
  } as const;
}
