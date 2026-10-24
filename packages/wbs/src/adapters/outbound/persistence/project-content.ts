import { createHash, randomUUID } from "node:crypto";
import { type Database, type Sql, type SqlRow } from "@line_bot_v1/platform/postgres";
import type { ContractReferenceReader } from "@line_bot_v1/contract/contracts/output/references";
import { isRecord, numberValue, numericValue, stringValue } from "@line_bot_v1/platform/validation";
import { createPostgresProjectContentScope } from "@line_bot_v1/project/composition/bootstrap/project-content-scope";
import type {
  ProjectWbsCommand,
  ProjectWbsHistory,
  ProjectWbsView,
} from "../../../contracts/dto/project-content.js";
import type {
  ProjectWbsContentTransaction,
  ProjectWbsStore,
} from "../../../contracts/repositories/project-content.js";
import type { WbsContractImportEvidence, WbsRevision } from "../../../domain/content.js";
import { parseWbsDocument, WbsError } from "../../../domain/document.js";
import { canEditProjectWbs } from "../../../domain/policies/project-access.js";
import { PostgresWbsScopeBoundary } from "./scope-boundary.js";

function revisionMetadata(row: SqlRow): Omit<WbsRevision, "document"> {
  const action = stringValue(row.action);
  if (
    action !== "initialize" &&
    action !== "create-node" &&
    action !== "import-contract" &&
    action !== "update-node" &&
    action !== "move-node" &&
    action !== "delete-subtree"
  )
    throw new WbsError(503, "WBS 歷史操作無法讀取。");
  return {
    id: stringValue(row.id),
    version: numberValue(row.version),
    parentRevisionId: row.parent_revision_id === null ? null : stringValue(row.parent_revision_id),
    actorUserId: stringValue(row.actor_user_id),
    action,
    at: Number(numericValue(row.at)),
  };
}
function revision(row: SqlRow): WbsRevision {
  try {
    return { ...revisionMetadata(row), document: parseWbsDocument(row.document) };
  } catch {
    throw new WbsError(503, "WBS 已保存內容格式不正確。");
  }
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
export class PostgresProjectWbsStore implements ProjectWbsStore {
  constructor(
    private readonly db: Database,
    private readonly source: (sql: Sql) => ContractReferenceReader,
  ) {}
  read(
    userId: string,
    selector: { projectId: string },
    revisionId?: string,
  ): Promise<ProjectWbsView> {
    return this.db.transaction(async (sql) => {
      const { project, role, closed } = await createPostgresProjectContentScope(sql).read(
        userId,
        selector.projectId,
      );
      const root = (
        await sql.query(
          "SELECT version,head_revision_id FROM project_wbs WHERE project_id=$1",
          [project.id],
          (r) => ({ version: numberValue(r.version), head: stringValue(r.head_revision_id) }),
        )
      ).rows[0];
      const id = revisionId ?? root?.head;
      const found = id
        ? (
            await sql.query(
              "SELECT * FROM project_wbs_revisions WHERE project_id=$1 AND id=$2",
              [project.id, id],
              revision,
            )
          ).rows[0]
        : undefined;
      if (id && !found) throw new WbsError(404, "找不到 WBS Revision。");
      return {
        project: { id: project.id, title: project.title },
        actorUserId: userId,
        closed,
        canEdit: !closed && canEditProjectWbs(role) && revisionId === undefined,
        canManageProject: role === "ADMIN",
        version: root?.version ?? 0,
        revision: found ?? null,
      };
    });
  }
  history(
    userId: string,
    selector: { projectId: string },
    before?: number,
  ): Promise<ProjectWbsHistory> {
    return this.db.transaction(async (sql) => {
      const { project } = await createPostgresProjectContentScope(sql).read(
        userId,
        selector.projectId,
      );
      const rows = (
        await sql.query(
          "SELECT id,version,parent_revision_id,actor_user_id,action,at FROM project_wbs_revisions WHERE project_id=$1 AND ($2::integer IS NULL OR version<$2) ORDER BY version DESC LIMIT 21",
          [project.id, before ?? null],
          revisionMetadata,
        )
      ).rows;
      const page = rows.slice(0, 20);
      return { revisions: page, next: rows.length > 20 ? (page.at(-1)?.version ?? null) : null };
    });
  }
  transact<T>(
    userId: string,
    command: ProjectWbsCommand,
    operation: (transaction: ProjectWbsContentTransaction) => Promise<T>,
  ): Promise<T> {
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(canonical(command)))
      .digest("hex");
    return this.db.transaction(async (sql) => {
      const { project, role, closed } = await createPostgresProjectContentScope(sql).read(
        userId,
        command.projectId,
      );
      await new PostgresWbsScopeBoundary(sql).projectWritable(project.id);
      return operation({
        scope: { projectId: project.id, closed, role },
        contracts: this.source(sql),
        nextId: randomUUID,
        replay: async () => {
          await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            `wbs-command:${userId}:${command.requestId}`,
          ]);
          if (
            (
              await sql.query(
                "SELECT 1 FROM project_wbs_governance_commands WHERE actor_user_id=$1 AND request_id=$2",
                [userId, command.requestId],
              )
            ).rows.length
          )
            throw new WbsError(409, "此 requestId 已用於 WBS 治理操作。");
          const legacy = (
            await sql.query(
              "SELECT repository_id,project_id,fingerprint,revision_id FROM legacy_wbs_command_evidence WHERE actor_user_id=$1 AND request_id=$2",
              [userId, command.requestId],
            )
          ).rows[0];
          if (legacy) {
            const legacyFingerprint = createHash("sha256")
              .update(
                JSON.stringify(
                  canonical({
                    ...command,
                    projectId: undefined,
                    repositoryId: stringValue(legacy.repository_id),
                  }),
                ),
              )
              .digest("hex");
            if (legacy.project_id !== project.id || legacy.fingerprint !== legacyFingerprint)
              throw new WbsError(409, "此 requestId 已用於不同 WBS 操作。");
            const found = (
              await sql.query(
                "SELECT * FROM project_wbs_revisions WHERE project_id=$1 AND id=$2",
                [project.id, stringValue(legacy.revision_id)],
                revision,
              )
            ).rows[0];
            if (!found) throw new WbsError(503, "匯入的 WBS 回執無法讀取。");
            return { requestId: command.requestId, projectId: project.id, revision: found };
          }
          const receipt = (
            await sql.query(
              "SELECT fingerprint,revision_id,project_id FROM project_wbs_commands WHERE actor_user_id=$1 AND request_id=$2",
              [userId, command.requestId],
              (r) => ({
                fingerprint: stringValue(r.fingerprint),
                revisionId: stringValue(r.revision_id),
                projectId: stringValue(r.project_id),
              }),
            )
          ).rows[0];
          if (!receipt) return null;
          if (receipt.fingerprint !== fingerprint || receipt.projectId !== project.id)
            throw new WbsError(409, "此 requestId 已用於不同 WBS 操作。");
          const found = (
            await sql.query(
              "SELECT * FROM project_wbs_revisions WHERE project_id=$1 AND id=$2",
              [project.id, receipt.revisionId],
              revision,
            )
          ).rows[0];
          if (!found) throw new WbsError(503, "WBS 回執無法讀取。");
          return { requestId: command.requestId, projectId: project.id, revision: found };
        },
        load: async () => {
          const head = (
            await sql.query(
              "SELECT version,head_revision_id FROM project_wbs WHERE project_id=$1 FOR UPDATE",
              [project.id],
              (r) => ({ version: numberValue(r.version), head: stringValue(r.head_revision_id) }),
            )
          ).rows[0];
          if (!head) return null;
          const current = (
            await sql.query(
              "SELECT * FROM project_wbs_revisions WHERE project_id=$1 AND id=$2",
              [project.id, head.head],
              revision,
            )
          ).rows[0];
          if (!current || current.version !== head.version)
            throw new WbsError(503, "WBS 目前版本無法讀取。");
          return current;
        },
        save: async (next, contractImport?: WbsContractImportEvidence) => {
          if (next.parentRevisionId === null)
            await sql.query(
              "INSERT INTO project_wbs(project_id,version,head_revision_id) VALUES($1,$2,$3)",
              [project.id, next.version, next.id],
            );
          await sql.query(
            "INSERT INTO project_wbs_revisions(id,project_id,version,parent_revision_id,actor_user_id,action,document,at,contract_import) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb)",
            [
              next.id,
              project.id,
              next.version,
              next.parentRevisionId,
              next.actorUserId,
              next.action,
              JSON.stringify(next.document),
              next.at,
              contractImport ? JSON.stringify(contractImport) : null,
            ],
          );
          if (next.parentRevisionId !== null) {
            const updated = await sql.query(
              "UPDATE project_wbs SET version=$2,head_revision_id=$3 WHERE project_id=$1 AND version=$4 RETURNING version",
              [project.id, next.version, next.id, command.expectedVersion],
            );
            if (!updated.rows.length) throw new WbsError(409, "WBS 版本衝突。");
          }
          await sql.query(
            "INSERT INTO project_wbs_commands(actor_user_id,request_id,project_id,fingerprint,revision_id) VALUES($1,$2,$3,$4,$5)",
            [userId, command.requestId, project.id, fingerprint, next.id],
          );
          return { requestId: command.requestId, projectId: project.id, revision: next };
        },
      });
    });
  }
}
