import "../../server.js";
import { validateSignature } from "@line/bot-sdk";
import { requireValue } from "../../config.js";

// Verify the original bytes before JSON parsing. Kept separate from the public barrel
// so the webhook adapter does not import the index that re-exports it.
export function verifyLineSignature(
  rawBody: Buffer,
  signature: string | null,
  channelSecret: string,
): boolean {
  requireValue(channelSecret, "LINE_CHANNEL_SECRET");
  if (!signature) return false;
  return validateSignature(rawBody, channelSecret, signature);
}
