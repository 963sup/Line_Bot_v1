import type { FileRevisionQualifier } from "@line_bot_v1/file/contracts/output/references";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import {
  contractDocumentReader,
  PostgresContractDocuments,
} from "../../adapters/outbound/persistence/documents.js";
import { createContractDocuments } from "../../application/use-cases/documents.js";

export function createPostgresContractDocuments(config: Readonly<{
  qualifier: (sql: Sql) => FileRevisionQualifier;
  db?: Database;
}>) {
  const transactions = new PostgresContractDocuments(config.qualifier, config.db ?? businessDatabase());
  return createContractDocuments({ transactions, now: Date.now });
}

export function createPostgresContractDocumentReader(
  sql: Sql,
  qualifier: (sql: Sql) => FileRevisionQualifier,
) {
  return contractDocumentReader(sql, qualifier);
}
