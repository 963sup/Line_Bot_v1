import { open, writeFile } from "node:fs/promises";
import { createFiles } from "@line_bot_v1/file/application/use-cases/files";
import { createPostgresFileDependencies } from "@line_bot_v1/file/composition/bootstrap/files";
import { FileError } from "@line_bot_v1/file/domain/error";
import { fileLimits } from "@line_bot_v1/file/domain/file";
import { createVercelAiGateway } from "@line_bot_v1/integration-vercel/gateway";
import { createPostgresIntelligenceProcessing } from "@line_bot_v1/intelligence/composition/bootstrap/processing";
import { plainTextProcessor } from "@line_bot_v1/intelligence/composition/bootstrap/processors";
import { InternalInputError } from "../runtime/internal-input.mjs";
import { runInternalOperation } from "../runtime/internal-operation.mjs";

const output = await runInternalOperation({
  errorMessage:
    "File operation failed; no credential, original file or provider payload is not logged.",
  errorClass: FileError,
  operation: async ({ db, input, actor, markMutation }) => {
    const files = createFiles({ ...createPostgresFileDependencies(db), now: Date.now });
    const processing = createPostgresIntelligenceProcessing(db);
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
      markMutation();
      result = await files.upload(actor, input.command, bytes);
    } else if (input.operation === "run") {
      let extractor;
      if (input.processor === "plain-text") extractor = plainTextProcessor;
      else if (input.processor === "vercel-ai-gateway") {
        if (
          !process.env.AI_GATEWAY_MODEL ||
          !(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN)
        )
          throw new InternalInputError("Configure the selected extractor.");
        extractor = createVercelAiGateway({ model: process.env.AI_GATEWAY_MODEL }).fileProcessor();
      } else throw new InternalInputError("Explicit processor selection is required.");
      markMutation();
      result = await processing.run(actor, input.command, extractor);
    } else if (input.operation === "result") {
      markMutation();
      result = await processing.result(actor, input.command);
    } else if (input.operation === "list")
      result = await files.list(actor, input.repositoryId, input.after);
    else if (input.operation === "pending-uploads")
      result = await files.pendingUploads(actor, input.repositoryId, input.after);
    else if (input.operation === "read-file")
      result = await files.file(actor, input.repositoryId, input.fileId, input.revisionId);
    else if (input.operation === "read-processing")
      result = await processing.read(actor, input.repositoryId, input.runId, input.revisionId);
    else if (input.operation === "download") {
      if (typeof input.destinationPath !== "string")
        throw new InternalInputError("A local destination path is required.");
      const source = await files.source(actor, input.repositoryId, input.fileId, input.revisionId);
      await writeFile(input.destinationPath, source.bytes, { flag: "wx", mode: 0o600 });
      result = { file: source.file, written: true };
    } else throw new InternalInputError("Unknown File operation.");
    return result;
  },
});
(output.ok ? console.log : console.error)(JSON.stringify(output));
if (!output.ok) process.exitCode = 1;
