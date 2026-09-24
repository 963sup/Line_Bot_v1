// Live Gemini intake probe with fixed synthetic input. No task is persisted.

import { createRequire } from "node:module";

if (process.argv.slice(2).join(" ") !== "--live") {
  console.error(
    "Usage: node scripts/probes/check-agent.mjs --live (one live Gemini intake call; no task persistence).",
  );
  process.exitCode = 1;
  process.exit();
}

const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { runIntakeAgent } = await import(require.resolve("@line-work/assistant/agents/intake"));
const { createGeminiClient } = await import(
  require.resolve("@line-work/assistant/adapters/gemini")
);

import { loadRootEnv } from "../runtime/load-env.mjs";

try {
  loadRootEnv();
  const result = await runIntakeAgent({
    models: createGeminiClient({ apiKey: process.env.GEMINI_API_KEY ?? "" }).models,
    model: process.env.GEMINI_MODEL ?? "",
    input: "明天下午檢查消防設備，整理成任務草稿。",
  });
  console.log(
    JSON.stringify({ ok: true, toolCalls: result.toolCalls, text: result.text }, null, 2),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      status: typeof error?.status === "number" ? error.status : undefined,
      message: "Agent acceptance failed; no task was persisted.",
    }),
  );
  process.exitCode = 1;
}
