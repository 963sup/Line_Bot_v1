import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { createPostgresObjectReferenceReader } from "@line_bot_v1/resources/composition/bootstrap/references";
import { PostgresIssueCollaborationStore } from "../../adapters/postgres/collaboration.js";

export function createPostgresIssueCollaborationStore(
  db: Database = businessDatabase(),
): PostgresIssueCollaborationStore {
  return new PostgresIssueCollaborationStore(createPostgresObjectReferenceReader, db);
}
