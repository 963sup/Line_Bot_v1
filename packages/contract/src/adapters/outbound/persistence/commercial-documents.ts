import type { FileRevisionQualifier } from "@line_bot_v1/file/contracts/output/references";
import type { Database, Sql, SqlRow } from "@line_bot_v1/platform/postgres";
import { numberValue, stringValue } from "@line_bot_v1/platform/validation";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import { commercialDocumentContentSchema } from "../../../contracts/input/commercial-document.js";
import type {
  CommercialDocumentReceipt,
  CommercialDocumentStore,
  CommercialDocumentTransaction,
  CommercialDraftCommand,
  CommercialDraftRevision,
} from "../../../contracts/output/commercial-documents.js";
import { ContractError } from "../../../domain/error.js";
import { canEditContract } from "../../../domain/policies/access.js";

const expectedColumns: Record<string, readonly string[]> = {
  commercial_documents: [
    "document_id",
    "repository_id",
    "version",
    "draft_revision_id",
    "verified_revision_id",
    "created_by_user_id",
    "created_at",
    "updated_at",
    "archived_at",
  ],
  commercial_document_revisions: [
    "revision_id",
    "document_id",
    "repository_id",
    "document_version",
    "parent_revision_id",
    "schema_version",
    "review_state",
    "source_file_id",
    "source_file_revision_id",
    "source_sha256",
    "extraction_result_id",
    "content",
    "human_evidence",
    "review_confirmation",
    "created_by_user_id",
    "created_at",
  ],
  commercial_document_commands: [
    "actor_user_id",
    "command_id",
    "repository_id",
    "document_id",
    "revision_id",
    "document_version",
    "operation",
    "fingerprint",
  ],
};
function source(row: SqlRow) {
  return {
    fileId: stringValue(row.source_file_id),
    fileRevisionId: stringValue(row.source_file_revision_id),
    sha256: stringValue(row.source_sha256),
  };
}
function receipt(row: SqlRow): CommercialDocumentReceipt {
  if (row.operation !== "CREATE_DRAFT")
    throw new TypeError("Unsupported stored commercial operation.");
  return {
    commandId: stringValue(row.command_id),
    documentId: stringValue(row.document_id),
    revisionId: stringValue(row.revision_id),
    documentVersion: numberValue(row.document_version),
    operation: "CREATE_DRAFT",
  };
}
function revision(row: SqlRow): CommercialDraftRevision {
  if (row.review_state !== "DRAFT" || Number(row.schema_version) !== 1)
    throw new TypeError("Unsupported stored commercial draft.");
  return {
    revisionId: stringValue(row.revision_id),
    documentId: stringValue(row.document_id),
    repositoryId: stringValue(row.repository_id),
    documentVersion: numberValue(row.document_version),
    parentRevisionId: row.parent_revision_id === null ? null : stringValue(row.parent_revision_id),
    schemaVersion: 1,
    reviewState: "DRAFT",
    source: source(row),
    extractionResultId: stringValue(row.extraction_result_id),
    content: commercialDocumentContentSchema.parse(
      typeof row.content === "string" ? JSON.parse(row.content) : row.content,
    ),
    createdByUserId: stringValue(row.created_by_user_id),
    createdAt: (row.created_at instanceof Date
      ? row.created_at
      : new Date(stringValue(row.created_at))
    ).toISOString(),
  };
}
export class PostgresCommercialDocuments implements CommercialDocumentStore {
  constructor(
    private readonly db: Database,
    private readonly qualifier: (sql: Sql) => FileRevisionQualifier,
  ) {}
  private qualify(
    sql: Sql,
    actor: string,
    repositoryId: string,
    reference: CommercialDraftRevision["source"],
  ) {
    return this.qualifier(sql).verify(actor, repositoryId, {
      fileId: reference.fileId,
      fileRevisionId: reference.fileRevisionId,
      fileSha256: reference.sha256,
    });
  }
  async assertReady(actor: string, repositoryId: string) {
    await this.db.transaction(async (sql) => {
      const scope = await repositoryContentScope(sql, actor, { repositoryId });
      if (scope.archived || !canEditContract(scope.repository.permissions))
        throw new ContractError(403, "Commercial document write denied.", "FORBIDDEN");
      const { rows } = await sql.query(
        "SELECT table_name,column_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='app_private' AND table_name=ANY($1::text[])",
        [Object.keys(expectedColumns)],
      );
      for (const [table, columns] of Object.entries(expectedColumns)) {
        const found = rows.filter((row) => row.table_name === table);
        const missing = columns.filter(
          (column) => !found.some((row) => row.column_name === column),
        );
        const unexpectedRequired = found
          .filter(
            (row) =>
              !columns.includes(String(row.column_name)) &&
              row.is_nullable === "NO" &&
              row.column_default === null,
          )
          .map((row) => String(row.column_name));
        if (missing.length || unexpectedRequired.length)
          throw new ContractError(
            503,
            `Commercial document storage contract is not ready: ${table}; missing columns: ${missing.join(",") || "none"}; unexpected required columns: ${unexpectedRequired.join(",") || "none"}.`,
            "DOCUMENT_STORE_NOT_READY",
          );
      }
    });
  }
  private async findReceipt(
    sql: Sql,
    actor: string,
    repositoryId: string,
    commandId: string,
    fingerprint?: string,
  ) {
    const row = (
      await sql.query(
        `SELECT command.*,revision.source_file_id,revision.source_file_revision_id,revision.source_sha256 FROM commercial_document_commands command JOIN commercial_document_revisions revision ON revision.repository_id=command.repository_id AND revision.document_id=command.document_id AND revision.revision_id=command.revision_id WHERE command.actor_user_id=$1 AND command.command_id=$2`,
        [actor, commandId],
      )
    ).rows[0];
    if (!row) return null;
    if (
      row.repository_id !== repositoryId ||
      (fingerprint !== undefined && row.fingerprint !== fingerprint)
    )
      throw new ContractError(
        409,
        "Command identity reused with different intent.",
        "COMMAND_ID_CONFLICT",
      );
    await this.qualify(sql, actor, repositoryId, source(row));
    return receipt(row);
  }
  async receipt(
    actor: string,
    query: Readonly<{ repositoryId: string; commandId: string }>,
    fingerprint?: string,
  ) {
    return this.db
      .transaction(async (sql) => {
        await repositoryContentScope(sql, actor, { repositoryId: query.repositoryId });
        return this.findReceipt(sql, actor, query.repositoryId, query.commandId, fingerprint);
      })
      .catch((error: unknown) => {
        const code = error && typeof error === "object" && "code" in error ? error.code : null;
        if (code === "42P01" || code === "42703")
          throw new ContractError(
            503,
            "Commercial document storage contract is not ready.",
            "DOCUMENT_STORE_NOT_READY",
            { cause: error },
          );
        throw error;
      });
  }
  async read(actor: string, query: Readonly<{ repositoryId: string; documentId: string }>) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, actor, { repositoryId: query.repositoryId });
      const row = (
        await sql.query(
          `SELECT revision.* FROM commercial_documents document JOIN commercial_document_revisions revision ON revision.repository_id=document.repository_id AND revision.document_id=document.document_id AND revision.revision_id=coalesce(document.draft_revision_id,document.verified_revision_id) WHERE document.repository_id=$1 AND document.document_id=$2`,
          [query.repositoryId, query.documentId],
        )
      ).rows[0];
      if (!row) return null;
      await this.qualify(sql, actor, query.repositoryId, source(row));
      return revision(row);
    });
  }
  async readBySource(
    actor: string,
    query: Readonly<{ repositoryId: string; fileId: string; fileRevisionId: string }>,
  ) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, actor, { repositoryId: query.repositoryId });
      const row = (
        await sql.query(
          `SELECT revision.* FROM commercial_document_revisions revision
         JOIN commercial_documents document ON document.repository_id=revision.repository_id
          AND document.document_id=revision.document_id
          AND coalesce(document.draft_revision_id,document.verified_revision_id)=revision.revision_id
         WHERE revision.repository_id=$1 AND revision.source_file_id=$2 AND revision.source_file_revision_id=$3
         ORDER BY revision.created_at DESC,revision.document_id DESC LIMIT 1`,
          [query.repositoryId, query.fileId, query.fileRevisionId],
        )
      ).rows[0];
      if (!row) return null;
      await this.qualify(sql, actor, query.repositoryId, source(row));
      return revision(row);
    });
  }
  async transact<T>(
    actor: string,
    command: CommercialDraftCommand,
    work: (tx: CommercialDocumentTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (sql) => {
      const scope = await repositoryContentScope(sql, actor, {
        repositoryId: command.repositoryId,
      });
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `commercial-command:${actor}:${command.commandId}`,
      ]);
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `commercial-document:${command.repositoryId}:${command.documentId}`,
      ]);
      const tx: CommercialDocumentTransaction = {
        writable: !scope.archived && canEditContract(scope.repository.permissions),
        replay: (commandId, fingerprint) =>
          this.findReceipt(sql, actor, command.repositoryId, commandId, fingerprint),
        current: async (documentId) => {
          const row = (
            await sql.query(
              "SELECT * FROM commercial_documents WHERE repository_id=$1 AND document_id=$2 FOR UPDATE",
              [command.repositoryId, documentId],
            )
          ).rows[0];
          return row
            ? {
                version: numberValue(row.version),
                draftRevisionId:
                  row.draft_revision_id === null ? null : stringValue(row.draft_revision_id),
                verifiedRevisionId:
                  row.verified_revision_id === null ? null : stringValue(row.verified_revision_id),
                archived: row.archived_at !== null,
              }
            : null;
        },
        qualifySource: (reference) => this.qualify(sql, actor, command.repositoryId, reference),
        appendDraft: async (value, expectedVersion) => {
          if (expectedVersion === 0)
            await sql.query(
              "INSERT INTO commercial_documents(document_id,repository_id,version,draft_revision_id,created_by_user_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$6)",
              [
                value.documentId,
                value.repositoryId,
                value.documentVersion,
                value.revisionId,
                actor,
                value.createdAt,
              ],
            );
          await sql.query(
            `INSERT INTO commercial_document_revisions(revision_id,document_id,repository_id,document_version,parent_revision_id,schema_version,review_state,source_file_id,source_file_revision_id,source_sha256,extraction_result_id,content,human_evidence,review_confirmation,created_by_user_id,created_at) VALUES($1,$2,$3,$4,$5,1,'DRAFT',$6,$7,$8,$9,$10::jsonb,'[]'::jsonb,null,$11,$12)`,
            [
              value.revisionId,
              value.documentId,
              value.repositoryId,
              value.documentVersion,
              value.parentRevisionId,
              value.source.fileId,
              value.source.fileRevisionId,
              value.source.sha256,
              value.extractionResultId,
              JSON.stringify(value.content),
              actor,
              value.createdAt,
            ],
          );
          if (
            expectedVersion > 0 &&
            !(
              await sql.query(
                "UPDATE commercial_documents SET version=$3,draft_revision_id=$4,updated_at=$5 WHERE repository_id=$1 AND document_id=$2 AND version=$6 RETURNING document_id",
                [
                  value.repositoryId,
                  value.documentId,
                  value.documentVersion,
                  value.revisionId,
                  value.createdAt,
                  expectedVersion,
                ],
              )
            ).rows.length
          )
            throw new ContractError(
              409,
              "Commercial document version conflict.",
              "VERSION_CONFLICT",
            );
        },
        record: async (commandId, fingerprint, value) => {
          const row = (
            await sql.query(
              `INSERT INTO commercial_document_commands(actor_user_id,command_id,repository_id,document_id,revision_id,document_version,operation,fingerprint) VALUES($1,$2,$3,$4,$5,$6,'CREATE_DRAFT',$7) RETURNING *`,
              [
                actor,
                commandId,
                value.repositoryId,
                value.documentId,
                value.revisionId,
                value.documentVersion,
                fingerprint,
              ],
            )
          ).rows[0];
          if (!row) throw new TypeError("Commercial receipt insert returned no row.");
          return receipt(row);
        },
      };
      return work(tx);
    });
  }
}
