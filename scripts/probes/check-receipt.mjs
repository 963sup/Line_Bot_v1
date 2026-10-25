// Live AI Gateway receipt probe with a synthetic image. No database writes or LINE messages.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { loadRootEnv } from "../runtime/load-env.mjs";

if (process.argv.slice(2).join(" ") !== "--live") {
  console.error(
    "Usage: node scripts/probes/check-receipt.mjs --live (one live AI Gateway call; build packages first). Not an offline or database acceptance test.",
  );
  process.exitCode = 1;
} else {
  try {
    const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
    const { recognizeReceiptImage } = await import(
      require.resolve("@line_bot_v1/expense/adapters/outbound/recognition/receipt-recognizer")
    );
    const { createVercelAiGateway } = await import("../../vercel/integrations/ai-gateway.mjs");
    loadRootEnv();
    const image = await readFile(
      new URL("../../packages/expense/test/fixtures/receipt-demo.png", import.meta.url),
    );
    const model = process.env.AI_GATEWAY_MODEL;
    if (!model) throw new Error("Missing AI Gateway configuration");
    const gateway = createVercelAiGateway(model);
    const result = await recognizeReceiptImage({
      image,
      mimeType: "image/png",
      generate: ({ prompt, image: bytes, mimeType }) =>
        gateway.file({
          prompt,
          bytes,
          mediaType: mimeType,
          maxOutputTokens: 1200,
          timeoutMs: 12_000,
        }),
    });
    assert.equal(result.isReceipt, true);
    assert.equal(Number(result.amount), 1260);
    assert.equal(result.currency, "TWD");
    assert.equal(result.date, "2026-09-06");
    console.log(
      JSON.stringify({
        ok: true,
        scope: "live-synthetic-ocr",
        modelCalls: 1,
        messagesSent: 0,
        databaseWrites: 0,
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        ok: false,
        status: typeof error?.status === "number" ? error.status : undefined,
        message: "Live synthetic receipt probe failed; no expense was posted.",
      }),
    );
    process.exitCode = 1;
  }
}
