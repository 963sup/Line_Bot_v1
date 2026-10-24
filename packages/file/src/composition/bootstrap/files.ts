import type { Database, Sql } from "@line_bot_v1/platform/postgres";
import { filePayloadInspector } from "../../adapters/outbound/binary/payloads.js";
import {
  PostgresFiles,
  createPostgresFileSavedResultReader as postgresSavedResults,
} from "../../adapters/outbound/persistence/files.js";
import { supabaseFileObjects } from "../../adapters/outbound/storage/supabase.js";
import type {
  FilePayloadInspector,
  FileReads,
  FileReclamation,
  FileTransactions,
} from "../../contracts/output/files.js";
import type { FileObjectRemoval, FileObjectStore } from "../../contracts/output/object-store.js";
import type { FileSavedResultReader } from "../../contracts/output/saved-results.js";

/** One technical provider, initialized only when the requested operation requires bytes. */
function lazyPrivateObjects() {
  let store: ReturnType<typeof supabaseFileObjects> | undefined;
  return () =>
    (store ??= supabaseFileObjects({
      url: process.env.SUPABASE_URL ?? "",
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    }));
}

/** Ordinary Files composition only exposes read/write object capabilities. */
export function createPostgresFileDependencies(
  db?: Database,
  objects?: FileObjectStore,
): {
  reads: FileReads;
  transactions: FileTransactions;
  payloads: FilePayloadInspector;
  objects: () => FileObjectStore;
} {
  const store = new PostgresFiles(db);
  const provider = lazyPrivateObjects();
  return {
    reads: store,
    transactions: store,
    payloads: filePayloadInspector,
    objects: objects ? () => objects : provider,
  };
}

/** The separate trusted-operator composition alone exposes destructive object removal. */
export function createPostgresFileReclamationDependencies(
  db?: Database,
  objects?: FileObjectRemoval,
): {
  maintenance: FileReclamation;
  objects: () => FileObjectRemoval;
} {
  const provider = lazyPrivateObjects();
  return {
    maintenance: new PostgresFiles(db),
    objects: objects ? () => objects : provider,
  };
}

/** Content receives only this read capability bound to its own transaction. */
export function createPostgresSavedFileResults(sql: Sql): FileSavedResultReader {
  return postgresSavedResults(sql);
}
