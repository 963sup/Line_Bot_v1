// Live Vercel AI Gateway probe with fixed synthetic input and no provider/model fallback.

if (process.argv.slice(2).join(" ") !== "--live") {
  console.error(
    "Usage: node scripts/probes/check-ai-gateway.mjs --live (one live Vercel AI Gateway probe).",
  );
  process.exitCode = 1;
  process.exit();
}

const { createVercelAiGateway } = await import("@line_bot_v1/integration-vercel/gateway");

import { loadRootEnv } from "../runtime/load-env.mjs";

try {
  loadRootEnv();
  const { AI_GATEWAY_MODEL: model } = process.env;
  if (!model) throw new Error("Missing AI Gateway configuration");
  const text = await createVercelAiGateway({ model }).text({
    system: "Reply with exactly the requested text and no explanation.",
    prompt: "Reply exactly: Line_Bot_v1 AI Gateway ready",
  });
  console.log(JSON.stringify({ ok: true, api: "Vercel AI Gateway", model, text }, null, 2));
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      status: typeof error?.status === "number" ? error.status : undefined,
      message:
        "AI Gateway probe failed; check Vercel credentials, quota, configured model availability or timeout. No provider/model fallback.",
    }),
  );
  process.exitCode = 1;
}
