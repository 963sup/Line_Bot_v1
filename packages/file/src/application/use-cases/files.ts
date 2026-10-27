import type {
  FilePayloadInspector,
  FileReads,
  FileTransactions,
} from "../../contracts/output/files.js";
import type { FileObjectStore } from "../../contracts/output/object-store.js";
import { createFileQueries } from "./queries.js";
import { createFileUploads } from "./uploads.js";

/** Stable public File application: one owner, distinct query and mutation paths. */
export function createFiles(deps: {
  reads: FileReads;
  transactions: FileTransactions;
  payloads: FilePayloadInspector;
  objects: () => FileObjectStore;
  now(): number;
}) {
  return { ...createFileQueries(deps), ...createFileUploads(deps) };
}
