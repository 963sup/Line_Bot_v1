import { open, writeFile } from "node:fs/promises";
import { createFiles } from "@line_bot_v1/file/application/use-cases/files";
import { createPostgresFileDependencies } from "@line_bot_v1/file/composition/bootstrap/files";
import {
  createGeminiFileProcessor,
  plainTextProcessor,
} from "@line_bot_v1/file/composition/bootstrap/processors";
import { FileError } from "@line_bot_v1/file/domain/error";
import { fileLimits } from "@line_bot_v1/file/domain/file";
import { PostgresDatabase } from "@line_bot_v1/platform/postgres";
import { classifyInternalFailure } from "../runtime/internal-failure.mjs";
import {
  InternalInputError,
  internalActor,
  readInternalInput,
} from "../runtime/internal-input.mjs";
import { loadRootEnv } from "../runtime/load-env.mjs";

let db;
let output;
let failed = false;
let mutationStarted = false;
try {
  loadRootEnv();
  db = new PostgresDatabase();
  const input = await readInternalInput();
  const actor = await internalActor(db, input.proof);
  const files = createFiles({ ...createPostgresFileDependencies(db), now: Date.now });
  let result;
  if (input.operation === "upload") {
    if (typeof input.sourcePath !== "string")
      throw new InternalInputError("A local source path is required.");
    const handle = await open(input.sourcePath, "r");
    let bytes;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size < 1 || stat.size > fileLimits.bytes)
        throw new InternalInputError("Unsupported source size.");
      const buffer = Buffer.alloc(fileLimits.bytes + 1);
      let count = 0;
      while (count < buffer.length) {
        const read = await handle.read(buffer, count, buffer.length - count, count);
        if (!read.bytesRead) break;
        count += read.bytesRead;
      }
      if (count < 1 || count > fileLimits.bytes)
        throw new InternalInputError("Unsupported source size.");
      bytes = buffer.subarray(0, count);
    } finally {
      await handle.close();
    }
    mutationStarted = true;
    result = await files.upload(actor, input.command, bytes);
  } else if (input.operation === "run") {
    let extractor;
    if (input.processor === "plain-text") extractor = plainTextProcessor;
    else if (input.processor === "gemini") {
      if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_MODEL)
        throw new InternalInputError("Configure the selected extractor.");
      extractor = createGeminiFileProcessor({
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL,
      });
    } else throw new InternalInputError("Explicit processor selection is required.");
    mutationStarted = true;
    result = await files.run(actor, input.command, extractor);
  } else if (input.operation === "result") {
    mutationStarted = true;
    result = await files.result(actor, input.command);
  } else if (input.operation === "list")
    result = await files.list(actor, input.repositoryId, input.after);
  else if (input.operation === "pending-uploads")
    result = await files.pendingUploads(actor, input.repositoryId, input.after);
  else if (input.operation === "read-file")
    result = await files.file(actor, input.repositoryId, input.fileId, input.revisionId);
  else if (input.operation === "read-processing")
    result = await files.processing(actor, input.repositoryId, input.runId, input.revisionId);
  else if (input.operation === "download") {
    if (typeof input.destinationPath !== "string")
      throw new InternalInputError("A local destination path is required.");
    const source = await files.source(actor, input.repositoryId, input.fileId, input.revisionId);
    await writeFile(input.destinationPath, source.bytes, { flag: "wx", mode: 0o600 });
    result = { file: source.file, written: true };
  } else throw new InternalInputError("Unknown File operation.");
  output = { ok: true, value: result };
} catch (error) {
  output = {
    ok: false,
    error: "File operation failed; no credential, original file or provider payload is logged.",
    ...classifyInternalFailure(error, FileError, mutationStarted),
  };
  failed = true;
} finally {
  if (db)
    try {
      await db.close();
    } catch {}
}
(failed ? console.error : console.log)(JSON.stringify(output));
if (failed) process.exitCode = 1;
