import { createPostgresFileRevisionQualifier } from "@line_bot_v1/file/composition/bootstrap/files";
import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import {
  contractDocumentReader,
  PostgresContractDocuments,
} from "../../adapters/outbound/persistence/documents.js";
import { createContractDocuments } from "../../application/use-cases/documents.js";

export function createPostgresContractDocuments(db: Database = businessDatabase()) {
  const transactions = new PostgresContractDocuments(createPostgresFileRevisionQualifier, db);
  return createContractDocuments({ transactions, now: Date.now });
}

export function createPostgresContractDocumentReader(
  sql: import("@line_bot_v1/platform/postgres").Sql,
) {
  return contractDocumentReader(sql, createPostgresFileRevisionQualifier);
}
