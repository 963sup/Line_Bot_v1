import { createHash, randomUUID } from "node:crypto";
import {
  businessDatabase,
  type Database,
  type Sql,
  type SqlRow,
} from "@line_bot_v1/platform/postgres";
import {
  booleanValue,
  literalValue,
  numberValue,
  numericValue,
  record,
  stringValue,
} from "@line_bot_v1/platform/validation";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type { ResourceReferenceReader } from "@line_bot_v1/resources/contracts/output/resource-references";
import type {
  ContentPlanReads,
  ContentPlanTransaction,
  ContentPlanTransactions,
  ContractDocumentExpansionReader,
} from "../../../contracts/output/plans.js";
import { ContentError } from "../../../domain/error.js";
import type {
  ContentFileImportEvidence,
  ContentMeasure,
  ContentPlanDocument,
  ContentPlanNode,
  ContentPlanRevision,
  ContentResourcePin,
} from "../../../domain/plan.js";
import { isQuantityUnit } from "../../../domain/quantity.js";

type ResourceReaderFactory = (sql: Sql) => ResourceReferenceReader;
type ContractDocumentExpansionFactory = (sql: Sql) => ContractDocumentExpansionReader;

function parsedJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return JSON.parse(value);
}

function decodeDocument(value: unknown): ContentPlanDocument {
  const document = record(parsedJson(value));
  if (
    document.schemaVersion !== 1 ||
    !Array.isArray(document.measures) ||
    !Array.isArray(document.nodes) ||
    !Array.isArray(document.resourcePins)
  )
    throw new TypeError("Expected Content plan document");
  return {
    schemaVersion: 1,
    measures: document.measures.map((item): ContentMeasure => {
      const measure = record(item);
      if (!isQuantityUnit(measure.unit))
        throw new TypeError("Invalid stored Content measure unit.");
      return {
        id: stringValue(measure.id),
        name: stringValue(measure.name),
        subject: stringValue(measure.subject),
        unit: measure.unit,
      };
    }),
    nodes: document.nodes.map((item): ContentPlanNode => {
      const node = record(item);
      const quantity = node.plannedQuantity === null ? null : record(node.plannedQuantity);
      return {
        id: stringValue(node.id),
        parentId: node.parentId === null ? null : stringValue(node.parentId),
        position: numberValue(node.position),
        kind: literalValue(node.kind, ["SUBJECT", "OBJECT", "SUBOBJECT", "WORK", "TASK"]),
        title: stringValue(node.title),
        body: stringValue(node.body),
        plannedQuantity: quantity
          ? { measureId: stringValue(quantity.measureId), value: stringValue(quantity.value) }
          : null,
      };
    }),
    resourcePins: document.resourcePins.map((item): ContentResourcePin => {
      const pin = record(item);
      return {
        nodeId: stringValue(pin.nodeId),
        resourceId: stringValue(pin.resourceId),
        resourceRevisionId: stringValue(pin.resourceRevisionId),
        kind: literalValue(pin.kind, ["LOCATION", "EQUIPMENT", "MATERIAL"]),
      };
    }),
  };
}

function decodeContentFileImport(value: unknown): ContentFileImportEvidence | undefined {
  if (value === null) return undefined;
  const item = record(value);
  return {
    repositoryId: stringValue(item.repositoryId),
    fileId: stringValue(item.fileId),
    fileRevisionId: stringValue(item.fileRevisionId),
    fileSha256: stringValue(item.fileSha256),
    runId: stringValue(item.runId),
    processingRevisionId: stringValue(item.processingRevisionId),
    observationId: stringValue(item.observationId),
    uncertain: booleanValue(item.uncertain),
    nodeId: stringValue(item.nodeId),
  };
}

function decodeContentPlanRevision(row: SqlRow): ContentPlanRevision {
  const fileImport = decodeContentFileImport(row.file_import);
  const contractImport =
    row.contract_document_import == null
      ? undefined
      : record(parsedJson(row.contract_document_import));
  const contractRows = contractImport?.rows;
  if (contractRows !== undefined && !Array.isArray(contractRows))
    throw new TypeError("Expected Contract document coverage rows");
  return {
    id: stringValue(row.id),
    repositoryId: stringValue(row.repository_id),
    version: numberValue(row.version),
    parentRevisionId: row.parent_revision_id === null ? null : stringValue(row.parent_revision_id),
    actorUserId: stringValue(row.actor_user_id),
    at: Number(numericValue(row.at)),
    action: literalValue(row.action, [
      "initialize",
      "replace",
      "import-file",
      "import-contract-document",
    ]),
    document: decodeDocument(row.document),
    ...(fileImport ? { fileImport } : {}),
    ...(contractImport
      ? {
          contractDocumentImport: {
            documentId: stringValue(contractImport.documentId),
            revisionId: stringValue(contractImport.revisionId),
            fileId: stringValue(contractImport.fileId),
            fileRevisionId: stringValue(contractImport.fileRevisionId),
            fileSha256: stringValue(contractImport.fileSha256),
            mappingVersion: literalValue(contractImport.mappingVersion, [
              "purchase-order-content-v1",
            ]),
            rows: (contractRows ?? []).map((value) => {
              const row = record(value);
              if (!Array.isArray(row.nodeIds))
                throw new TypeError("Expected Contract row Content nodes");
              return {
                sourceRowId: stringValue(row.sourceRowId),
                disposition: literalValue(row.disposition, ["CONTENT_WORK", "COMMERCIAL_ONLY"]),
                nodeIds: row.nodeIds.map(stringValue),
              };
            }),
          },
        }
      : {}),
  };
}

export async function readContentPlanRevision(
  sql: Sql,
  repositoryId: string,
  revisionId?: string,
): Promise<ContentPlanRevision | null> {
  const row = (
    await sql.query(
      revisionId === undefined
        ? `SELECT revision.id,revision.repository_id,revision.version,revision.parent_revision_id,
                  revision.actor_user_id,revision.at,revision.action,revision.file_import,revision.contract_document_import,
                  jsonb_set(revision.document,'{resourcePins}',coalesce((
                    SELECT jsonb_agg(jsonb_build_object(
                      'nodeId',pin.node_id,'resourceId',pin.resource_id,
                      'resourceRevisionId',pin.resource_revision_id,'kind',pin.kind
                    ) ORDER BY pin.node_id,pin.resource_id)
                    FROM content_plan_resource_pins pin
                    WHERE pin.repository_id=revision.repository_id AND pin.plan_revision_id=revision.id
                  ),'[]'::jsonb)) document
           FROM content_plans plan
           JOIN content_plan_revisions revision ON revision.id=plan.head_revision_id
           WHERE plan.repository_id=$1`
        : `SELECT revision.id,revision.repository_id,revision.version,revision.parent_revision_id,
                  revision.actor_user_id,revision.at,revision.action,revision.file_import,revision.contract_document_import,
                  jsonb_set(revision.document,'{resourcePins}',coalesce((
                    SELECT jsonb_agg(jsonb_build_object(
                      'nodeId',pin.node_id,'resourceId',pin.resource_id,
                      'resourceRevisionId',pin.resource_revision_id,'kind',pin.kind
                    ) ORDER BY pin.node_id,pin.resource_id)
                    FROM content_plan_resource_pins pin
                    WHERE pin.repository_id=revision.repository_id AND pin.plan_revision_id=revision.id
                  ),'[]'::jsonb)) document
           FROM content_plan_revisions revision WHERE repository_id=$1 AND id=$2`,
      revisionId === undefined ? [repositoryId] : [repositoryId, revisionId],
      decodeContentPlanRevision,
    )
  ).rows[0];
  return row ?? null;
}

export class PostgresContentPlans implements ContentPlanReads, ContentPlanTransactions {
  constructor(
    private readonly resourceReader: ResourceReaderFactory,
    private readonly contractDocumentReader: ContractDocumentExpansionFactory,
    private readonly db: Database = businessDatabase(),
  ) {}

  read(userId: string, query: Readonly<{ repositoryId: string; revisionId?: string }>) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId: query.repositoryId });
      const revision = await readContentPlanRevision(sql, query.repositoryId, query.revisionId);
      if (!revision) throw new ContentError(404, "Content plan revision not found.", "NOT_FOUND");
      return revision;
    });
  }

  history(userId: string, query: Readonly<{ repositoryId: string }>, before?: number) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId: query.repositoryId });
      if (!(await readContentPlanRevision(sql, query.repositoryId)))
        throw new ContentError(404, "Content plan not found.", "NOT_FOUND");
      const rows = (
        await sql.query(
          `SELECT revision.id,revision.repository_id,revision.version,revision.parent_revision_id,
                  revision.actor_user_id,revision.at,revision.action,revision.file_import,
                  jsonb_set(revision.document,'{resourcePins}',coalesce((
                    SELECT jsonb_agg(jsonb_build_object(
                      'nodeId',pin.node_id,'resourceId',pin.resource_id,
                      'resourceRevisionId',pin.resource_revision_id,'kind',pin.kind
                    ) ORDER BY pin.node_id,pin.resource_id)
                    FROM content_plan_resource_pins pin
                    WHERE pin.repository_id=revision.repository_id AND pin.plan_revision_id=revision.id
                  ),'[]'::jsonb)) document
           FROM content_plan_revisions revision
           WHERE revision.repository_id=$1 AND ($2::integer IS NULL OR revision.version<$2)
           ORDER BY revision.version DESC LIMIT 21`,
          [query.repositoryId, before ?? null],
          decodeContentPlanRevision,
        )
      ).rows;
      const revisions = rows.slice(0, 20);
      return { revisions, next: rows.length > 20 ? (revisions.at(-1)?.version ?? null) : null };
    });
  }

  transact<T>(
    userId: string,
    scope: Readonly<{ repositoryId: string }>,
    evidence: Readonly<{ requestId: string; payload: string }>,
    operation: (tx: ContentPlanTransaction) => Promise<T>,
  ): Promise<T> {
    const fingerprint = createHash("sha256").update(evidence.payload).digest("hex");
    return this.db.transaction(async (sql) => {
      const { repository, archived } = await repositoryContentScope(sql, userId, {
        repositoryId: scope.repositoryId,
      });
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `content:${userId}:${evidence.requestId}`,
      ]);
      return operation({
        scope: { repositoryId: repository.id, archived, permissions: repository.permissions },
        resources: this.resourceReader(sql),
        contractDocuments: this.contractDocumentReader(sql),
        nextId: randomUUID,
        replay: async () => {
          const row = (
            await sql.query(
              `SELECT fingerprint,repository_id,revision_id FROM content_plan_commands
               WHERE actor_user_id=$1 AND request_id=$2`,
              [userId, evidence.requestId],
              (value) => ({
                fingerprint: stringValue(value.fingerprint),
                repositoryId: stringValue(value.repository_id),
                revisionId: stringValue(value.revision_id),
              }),
            )
          ).rows[0];
          if (!row) return null;
          if (row.fingerprint !== fingerprint)
            throw new ContentError(
              409,
              "Content request identity reused with different content.",
              "REQUEST_ID_REUSED",
            );
          const revision = await readContentPlanRevision(sql, row.repositoryId, row.revisionId);
          if (!revision) throw new ContentError(503, "Content receipt unavailable.", "UNAVAILABLE");
          return { requestId: evidence.requestId, revision };
        },
        plans: {
          load: async () => {
            await sql.query(
              "SELECT repository_id FROM content_plans WHERE repository_id=$1 FOR UPDATE",
              [repository.id],
            );
            return readContentPlanRevision(sql, repository.id);
          },
          hasContractDocumentImport: async (documentId, revisionId) =>
            (
              await sql.query(
                `SELECT 1 FROM content_plan_revisions
               WHERE repository_id=$1 AND contract_document_import->>'documentId'=$2
                 AND contract_document_import->>'revisionId'=$3 LIMIT 1`,
                [repository.id, documentId, revisionId],
              )
            ).rows.length > 0,
          save: async (next, expectedVersion) => {
            if (next.document.nodes.length) {
              const historicalKinds = (
                await sql.query(
                  `SELECT item->>'id' id,item->>'kind' kind
                   FROM content_plan_revisions revision
                   CROSS JOIN LATERAL jsonb_array_elements(revision.document->'nodes') item
                   WHERE revision.repository_id=$1 AND item->>'id'=ANY($2::text[])`,
                  [repository.id, next.document.nodes.map((node) => node.id)],
                  (row) => ({ id: stringValue(row.id), kind: stringValue(row.kind) }),
                )
              ).rows;
              const nextKinds = new Map(next.document.nodes.map((node) => [node.id, node.kind]));
              if (
                historicalKinds.some(
                  (historical) => nextKinds.get(historical.id) !== historical.kind,
                )
              )
                throw new ContentError(
                  409,
                  "Content node identity cannot be reassigned to another kind.",
                  "LIFECYCLE_CONFLICT",
                );
            }
            if (next.parentRevisionId === null)
              await sql.query(
                `INSERT INTO content_plans(repository_id,version,head_revision_id) VALUES($1,$2,$3)`,
                [repository.id, next.version, next.id],
              );
            await sql.query(
              `INSERT INTO content_plan_revisions(
                 id,repository_id,version,parent_revision_id,actor_user_id,at,action,document,file_import,contract_document_import
               ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb)`,
              [
                next.id,
                repository.id,
                next.version,
                next.parentRevisionId,
                next.actorUserId,
                next.at,
                next.action,
                JSON.stringify({
                  schemaVersion: 1,
                  measures: next.document.measures,
                  nodes: next.document.nodes,
                }),
                next.fileImport ? JSON.stringify(next.fileImport) : null,
                next.contractDocumentImport ? JSON.stringify(next.contractDocumentImport) : null,
              ],
            );
            for (const pin of next.document.resourcePins)
              await sql.query(
                `INSERT INTO content_plan_resource_pins(
                   repository_id,plan_revision_id,node_id,resource_id,resource_revision_id,kind
                 ) VALUES($1,$2,$3,$4,$5,$6)`,
                [
                  repository.id,
                  next.id,
                  pin.nodeId,
                  pin.resourceId,
                  pin.resourceRevisionId,
                  pin.kind,
                ],
              );
            if (
              next.parentRevisionId !== null &&
              !(
                await sql.query(
                  `UPDATE content_plans SET version=$2,head_revision_id=$3
                   WHERE repository_id=$1 AND version=$4 RETURNING repository_id`,
                  [repository.id, next.version, next.id, expectedVersion],
                )
              ).rows.length
            )
              throw new ContentError(409, "Content plan version conflict.", "VERSION_CONFLICT");
          },
        },
        record: async (revision) => {
          await sql.query(
            `INSERT INTO content_plan_commands(
               actor_user_id,request_id,repository_id,fingerprint,revision_id
             ) VALUES($1,$2,$3,$4,$5)`,
            [userId, evidence.requestId, repository.id, fingerprint, revision.id],
          );
        },
      });
    });
  }
}
