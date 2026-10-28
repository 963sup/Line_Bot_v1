import { createPrivateStorageClient } from "@line_bot_v1/integration-supabase/storage-client";
import type { CommercialExtractionResult } from "../../contracts/output/commercial-intake.js";

const bucketName = "repository-files";

/** Durable, immutable recovery copy. The Contract revision remains the business write authority. */
export function createSupabaseExtractionJsonStore(config: {
  url: string;
  serviceRoleKey: string;
}) {
  const bucket = createPrivateStorageClient(config).storage.from(bucketName);
  return async (input: {
    actorUserId: string;
    repositoryId: string;
    extractionResultId: string;
    result: CommercialExtractionResult;
  }): Promise<void> => {
    const repositoryKey = createHash("sha256").update(input.repositoryId).digest("hex");
    const key = `commercial-extractions/${repositoryKey}/${input.extractionResultId}.json`;
    const body = new TextEncoder().encode(JSON.stringify({
      version: 1,
      actorUserId: input.actorUserId,
      repositoryId: input.repositoryId,
      extractionResultId: input.extractionResultId,
      result: input.result,
    }));
    const uploaded = await bucket.upload(key, body, {
      upsert: false,
      contentType: "application/json",
      cacheControl: "31536000",
    });
    const storageError = uploaded.error as { message?: string; statusCode?: string } | null;
    if (
      storageError &&
      storageError.statusCode !== "409" &&
      !/already exists|duplicate/i.test(storageError.message ?? "")
    )
      throw uploaded.error;
  };
}
import { createHash } from "node:crypto";
