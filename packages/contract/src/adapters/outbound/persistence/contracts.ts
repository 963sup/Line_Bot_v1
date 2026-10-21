import { createHash, randomUUID } from "node:crypto";
import type { ContentPlanReferenceReader } from "@line_bot_v1/content/contracts/output/plan-references";
import type { ContentPlanItemBasis } from "@line_bot_v1/content/domain/plan-reference";
import type { QuantityUnit } from "@line_bot_v1/content/domain/quantity";
import {
  businessDatabase,
  type Database,
  type Sql,
  type SqlRow,
} from "@line_bot_v1/platform/postgres";
import {
  isRecord,
  literalValue,
  numberValue,
  numericValue,
  stringValue,
} from "@line_bot_v1/platform/validation";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type { ResourceQuantityBasis } from "@line_bot_v1/resources/domain/engineering-reference";
import type { ContractSummary } from "../../../contracts/dto/contracts.js";
import type {
  ContractReads,
  ContractTransaction,
  ContractTransactions,
} from "../../../contracts/output/contracts.js";
import type { ContractRevision, FrozenContractLine } from "../../../domain/contract.js";
import { ContractError } from "../../../domain/error.js";

type ContentReaderFactory = (sql: Sql) => ContentPlanReferenceReader;

function parsedJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new TypeError("Expected valid JSON");
  }
}

function quantityUnit(value: unknown): QuantityUnit {
  return literalValue(value, ["m", "pcs"]);
}

function decodeResource(value: unknown): ResourceQuantityBasis {
  if (!isRecord(value) || !isRecord(value.measure)) throw new TypeError("Expected Resource basis");
  return {
    resourceId: stringValue(value.resourceId),
    resourceRevisionId: stringValue(value.resourceRevisionId),
    resourceVersion: numberValue(value.resourceVersion),
    name: stringValue(value.name),
    measure: {
      id: stringValue(value.measure.id),
      name: stringValue(value.measure.name),
      subject: stringValue(value.measure.subject),
      unit: quantityUnit(value.measure.unit),
    },
    sourceQuantity: stringValue(value.sourceQuantity),
  };
}

function decodeContent(value: unknown): ContentPlanItemBasis {
  if (!isRecord(value) || !isRecord(value.node) || !Array.isArray(value.node.path))
    throw new TypeError("Expected Content plan item basis");
  const planned = value.node.plannedQuantity;
  let plannedQuantity: ContentPlanItemBasis["node"]["plannedQuantity"] = null;
  if (planned !== null) {
    if (!isRecord(planned) || !isRecord(planned.measure))
      throw new TypeError("Expected Content planned quantity");
    plannedQuantity = {
      value: stringValue(planned.value),
      measure: {
        id: stringValue(planned.measure.id),
        name: stringValue(planned.measure.name),
        subject: stringValue(planned.measure.subject),
        unit: literalValue(planned.measure.unit, ["m", "pcs"]),
      },
    };
  }
  return {
    repositoryId: stringValue(value.repositoryId),
    planRevisionId: stringValue(value.planRevisionId),
    planVersion: numberValue(value.planVersion),
    node: {
      id: stringValue(value.node.id),
      kind: literalValue(value.node.kind, ["WORK", "TASK"]),
      title: stringValue(value.node.title),
      body: stringValue(value.node.body),
      path: value.node.path.map((item) => {
        if (!isRecord(item)) throw new TypeError("Expected Content path item");
        return {
          id: stringValue(item.id),
          kind: literalValue(item.kind, ["SUBJECT", "OBJECT", "SUBOBJECT", "WORK", "TASK"]),
          title: stringValue(item.title),
        };
      }),
      plannedQuantity,
    },
  };
}

function decodeContractLines(value: unknown): FrozenContractLine[] {
  const parsed = parsedJson(value);
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 100)
    throw new TypeError("Expected Contract lines");
  return parsed.map((line) => {
    if (!isRecord(line)) throw new TypeError("Expected Contract line");
    const common = {
      lineId: stringValue(line.lineId),
      agreedQuantity: stringValue(line.agreedQuantity),
    };
    const hasContent = Object.hasOwn(line, "content");
    const hasResource = Object.hasOwn(line, "resource");
    if (hasContent === hasResource) throw new TypeError("Expected one Contract line basis");
    if (hasContent) return { ...common, content: decodeContent(line.content) };
    return { ...common, resource: decodeResource(line.resource) };
  });
}

function decodeContractRevision(row: SqlRow): ContractRevision {
  return {
    id: stringValue(row.id),
    contractId: stringValue(row.contract_id),
    repositoryId: stringValue(row.repository_id),
    version: numberValue(row.version),
    parentRevisionId: row.parent_revision_id === null ? null : stringValue(row.parent_revision_id),
    actorUserId: stringValue(row.actor_user_id),
    at: Number(numericValue(row.at)),
    action: literalValue(row.action, ["create", "edit", "activate", "close"]),
    state: literalValue(row.state, ["DRAFT", "ACTIVE", "CLOSED"]),
    title: stringValue(row.title),
    body: stringValue(row.body),
    lines: decodeContractLines(row.lines),
  };
}

export async function readContractRevision(
  sql: Sql,
  repositoryId: string,
  contractId: string,
  revisionId?: string,
): Promise<ContractRevision | null> {
  const row = (
    await sql.query(
      revisionId === undefined
        ? `SELECT revision.*
           FROM engineering_contracts contract
           JOIN engineering_contract_revisions revision
             ON revision.contract_id=contract.id AND revision.id=contract.head_revision_id
           WHERE contract.repository_id=$1 AND contract.id=$2`
        : `SELECT * FROM engineering_contract_revisions
           WHERE repository_id=$1 AND contract_id=$2 AND id=$3`,
      revisionId === undefined
        ? [repositoryId, contractId]
        : [repositoryId, contractId, revisionId],
      decodeContractRevision,
    )
  ).rows[0];
  return row ?? null;
}

export class PostgresContracts implements ContractReads, ContractTransactions {
  constructor(
    private readonly contentReader: ContentReaderFactory,
    private readonly db: Database = businessDatabase(),
  ) {}

  list(userId: string, repositoryId: string, after?: string) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId });
      const rows = (
        await sql.query(
          `SELECT contract.id,contract.version,revision.title,revision.state,revision.at
           FROM engineering_contracts contract
           JOIN engineering_contract_revisions revision
             ON revision.id=contract.head_revision_id AND revision.contract_id=contract.id
           WHERE contract.repository_id=$1 AND ($2::uuid IS NULL OR contract.id>$2)
           ORDER BY contract.id LIMIT 21`,
          [repositoryId, after ?? null],
          (row): ContractSummary => ({
            contractId: stringValue(row.id),
            version: numberValue(row.version),
            title: stringValue(row.title),
            state: literalValue(row.state, ["DRAFT", "ACTIVE", "CLOSED"]),
            updatedAt: Number(numericValue(row.at)),
          }),
        )
      ).rows;
      const contracts = rows.slice(0, 20);
      return {
        contracts,
        next: rows.length > 20 ? (contracts.at(-1)?.contractId ?? null) : null,
      };
    });
  }

  read(
    userId: string,
    query: Readonly<{ repositoryId: string; contractId: string; revisionId?: string }>,
  ) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId: query.repositoryId });
      const found = await readContractRevision(
        sql,
        query.repositoryId,
        query.contractId,
        query.revisionId,
      );
      if (!found) throw new ContractError(404, "Contract revision not found.", "NOT_FOUND");
      return found;
    });
  }

  history(
    userId: string,
    query: Readonly<{ repositoryId: string; contractId: string }>,
    before?: number,
  ) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId: query.repositoryId });
      if (!(await readContractRevision(sql, query.repositoryId, query.contractId)))
        throw new ContractError(404, "Contract not found.", "NOT_FOUND");
      const rows = (
        await sql.query(
          `SELECT * FROM engineering_contract_revisions
           WHERE repository_id=$1 AND contract_id=$2
             AND ($3::integer IS NULL OR version<$3)
           ORDER BY version DESC LIMIT 21`,
          [query.repositoryId, query.contractId, before ?? null],
          decodeContractRevision,
        )
      ).rows;
      const revisions = rows.slice(0, 20);
      return {
        revisions,
        next: rows.length > 20 ? (revisions.at(-1)?.version ?? null) : null,
      };
    });
  }

  transact<T>(
    userId: string,
    scope: Readonly<{ repositoryId: string; contractId: string }>,
    evidence: Readonly<{ requestId: string; payload: string }>,
    operation: (tx: ContractTransaction) => Promise<T>,
  ) {
    const fingerprint = createHash("sha256").update(evidence.payload).digest("hex");
    return this.db.transaction(async (sql) => {
      const { repository, archived } = await repositoryContentScope(sql, userId, {
        repositoryId: scope.repositoryId,
      });
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `contract:${userId}:${evidence.requestId}`,
      ]);
      return operation({
        scope: { repositoryId: repository.id, archived, permissions: repository.permissions },
        content: this.contentReader(sql),
        nextId: randomUUID,
        replay: async () => {
          const row = (
            await sql.query(
              `SELECT fingerprint,contract_id,revision_id
               FROM engineering_contract_commands
               WHERE actor_user_id=$1 AND request_id=$2`,
              [userId, evidence.requestId],
              (value) => ({
                fingerprint: stringValue(value.fingerprint),
                contractId: stringValue(value.contract_id),
                revisionId: stringValue(value.revision_id),
              }),
            )
          ).rows[0];
          if (!row) return null;
          if (row.fingerprint !== fingerprint)
            throw new ContractError(
              409,
              "Contract request identity reused with different content.",
              "REQUEST_ID_REUSED",
            );
          const revision = await readContractRevision(
            sql,
            repository.id,
            row.contractId,
            row.revisionId,
          );
          if (!revision)
            throw new ContractError(503, "Contract receipt unavailable.", "UNAVAILABLE");
          return { requestId: evidence.requestId, revision };
        },
        contracts: {
          load: async () => {
            await sql.query(
              `SELECT id FROM engineering_contracts
               WHERE repository_id=$1 AND id=$2 FOR UPDATE`,
              [repository.id, scope.contractId],
            );
            return readContractRevision(sql, repository.id, scope.contractId);
          },
          save: async (next, expectedVersion) => {
            if (next.parentRevisionId === null)
              await sql.query(
                `INSERT INTO engineering_contracts(id,repository_id,version,head_revision_id)
                 VALUES($1,$2,$3,$4)`,
                [next.contractId, repository.id, next.version, next.id],
              );
            await sql.query(
              `INSERT INTO engineering_contract_revisions(
                 id,contract_id,repository_id,version,parent_revision_id,actor_user_id,
                 at,action,state,title,body,lines
               ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
              [
                next.id,
                next.contractId,
                repository.id,
                next.version,
                next.parentRevisionId,
                next.actorUserId,
                next.at,
                next.action,
                next.state,
                next.title,
                next.body,
                JSON.stringify(next.lines),
              ],
            );
            if (
              next.parentRevisionId !== null &&
              !(
                await sql.query(
                  `UPDATE engineering_contracts
                   SET version=$3,head_revision_id=$4
                   WHERE id=$1 AND repository_id=$2 AND version=$5 RETURNING id`,
                  [next.contractId, repository.id, next.version, next.id, expectedVersion],
                )
              ).rows.length
            )
              throw new ContractError(409, "Contract version conflict.", "VERSION_CONFLICT");
          },
        },
        record: async (next) => {
          await sql.query(
            `INSERT INTO engineering_contract_commands(
               actor_user_id,request_id,contract_id,repository_id,fingerprint,revision_id
             ) VALUES($1,$2,$3,$4,$5,$6)`,
            [userId, evidence.requestId, next.contractId, repository.id, fingerprint, next.id],
          );
        },
      });
    });
  }
}
