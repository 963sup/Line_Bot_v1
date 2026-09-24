// Live Gemini Developer API probe with fixed synthetic input and no provider/model fallback.

import { createRequire } from "node:module";

if (process.argv.slice(2).join(" ") !== "--live") {
  console.error(
    "Usage: node scripts/probes/check-gemini.mjs --live (one live Gemini Developer API probe).",
  );
  process.exitCode = 1;
  process.exit();
}

const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createGeminiClient, runGeminiProbe } = await import(
  require.resolve("@line-work/assistant/adapters/gemini")
);

import { loadRootEnv } from "../runtime/load-env.mjs";

try {
  loadRootEnv();
  const { GEMINI_API_KEY: apiKey, GEMINI_MODEL: model } = process.env;
  if (!apiKey || !model) throw new Error("Missing Gemini configuration");
  const text = await runGeminiProbe(createGeminiClient({ apiKey }), model);
  console.log(JSON.stringify({ ok: true, api: "Gemini Developer API", model, text }, null, 2));
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      status: typeof error?.status === "number" ? error.status : undefined,
      message:
        "Gemini probe failed; check API key, quota, configured model availability or timeout. No provider/model fallback.",
    }),
  );
  process.exitCode = 1;
}
