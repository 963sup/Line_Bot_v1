import { readUserByIdentity } from "@line_bot_v1/account/postgres";
import { verifyLiffUser } from "@line_bot_v1/line/identity";
import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { LINE_PROVIDER_NAMESPACE } from "@line_bot_v1/line/provider";

/** Secrets arrive on stdin, never argv, URLs or diagnostic output. */
export async function readInternalInput(stream = process.stdin) {
  let text = "";
  for await (const chunk of stream) {
    text += chunk;
    if (Buffer.byteLength(text) > 1048576) throw new Error("Internal request is too large.");
  }
  const input = JSON.parse(text);
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid internal request.");
  return input;
}

export async function internalActor(db, proof, request = fetch) {
  if (typeof proof !== "string") throw new Error("A LINE identity proof is required.");
  const subject = await verifyLiffUser(proof, lineMiniApp().channelId, request);
  return db.transaction(async (sql) => {
    const user = await readUserByIdentity(sql, LINE_PROVIDER_NAMESPACE, subject, "share");
    if (!user || user.status !== "active")
      throw new Error("Current User qualification is unavailable.");
    return user.id;
  });
}
