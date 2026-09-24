/**
 * Verify the configured LINE Messaging API bot without leaking credentials.
 * The provider bot userId is diagnostic context and may appear as webhook destination.
 */
import { createRequire } from "node:module";

const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createLineClient } = await import(
  require.resolve("@line-work/line-channel/adapters/messaging")
);

import { loadRootEnv } from "../runtime/load-env.mjs";

try {
  loadRootEnv();
  const client = createLineClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
  });
  const bot = await client.getBotInfo();
  const botUserId = bot.userId;
  if (typeof botUserId !== "string" || !/^U[a-fA-F0-9]{32}$/.test(botUserId)) {
    throw new Error("LINE Bot info returned an invalid userId.");
  }
  console.log(
    JSON.stringify({ ok: true, displayName: bot.displayName, userId: botUserId }, null, 2),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      message: "LINE account verification failed.",
      status: typeof error?.status === "number" ? error.status : undefined,
    }),
  );
  process.exitCode = 1;
}
