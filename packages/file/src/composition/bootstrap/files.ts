import type { Database, Sql } from "@line_bot_v1/platform/postgres";
import { filePayloadInspector } from "../../adapters/outbound/binary/payloads.js";
import {
  PostgresFiles,
  createPostgresFileRevisionQualifier as postgresRevisionQualifier,
} from "../../adapters/outbound/persistence/files.js";
import { supabaseFileObjects } from "../../adapters/outbound/storage/supabase.js";
import { PostgresFileReclamation } from "../../adapters/outbound/persistence/reclamation.js";
import { createFileSourceReader } from "../../application/use-cases/sources.js";
import type {
  FilePayloadInspector,
  FileReads,
  FileReclamation,
  FileTransactions,
} from "../../contracts/output/files.js";
import type { FileObjectRemoval, FileObjectStore } from "../../contracts/output/object-store.js";
import type { FileRevisionQualifier, FileSourceReader } from "../../contracts/output/references.js";

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
    maintenance: new PostgresFileReclamation(db),
    objects: objects ? () => objects : provider,
  };
}

export function createPostgresFileSourceReader(
  db?: Database,
  objects?: FileObjectStore,
): FileSourceReader {
  const dependencies = createPostgresFileDependencies(db, objects);
  return createFileSourceReader({ reads: dependencies.reads, objects: dependencies.objects });
}

export function createPostgresFileRevisionQualifier(sql: Sql): FileRevisionQualifier {
  return postgresRevisionQualifier(sql);
}
