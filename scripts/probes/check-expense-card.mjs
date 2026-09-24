// Live LINE validateReply probe for a synthetic expense card. No message is sent.

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

if (process.argv.slice(2).join(" ") !== "--live") {
  console.error(
    "Usage: node scripts/probes/check-expense-card.mjs --live (one live LINE validateReply call; messagesSent remains 0).",
  );
  process.exitCode = 1;
  process.exit();
}

const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createLineClient } = await import(
  pathToFileURL(require.resolve("@line-work/line-channel/adapters/messaging")).href
);
const { tsImport } = require("tsx/esm/api");
const { renderExpenseNotice } = await tsImport(
  "../../apps/web/src/modules/expense/notice.server.ts",
  import.meta.url,
);
const { lineMiniApp } = await tsImport(
  "../../apps/web/src/shared/server/line-mini-app.ts",
  import.meta.url,
);

import { loadRootEnv } from "../runtime/load-env.mjs";

try {
  loadRootEnv();
  const client = createLineClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
  });
  await client.validateReply({
    messages: [
      renderExpenseNotice(
        { id: "00000000-0000-4000-8000-000000000000", number: 5 },
        lineMiniApp().url,
      ),
    ],
  });
  console.log(JSON.stringify({ ok: true, validatedCards: 1, messagesSent: 0 }));
} catch {
  console.error("Expense notification validation failed. No message was sent.");
  process.exitCode = 1;
}
