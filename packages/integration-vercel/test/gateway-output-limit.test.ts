import assert from "node:assert/strict";
import test from "node:test";
import { createVercelAiGateway } from "../src/gateway.js";

test("structured extraction rejects output limits outside 1–24,000 before provider I/O", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Provider I/O must not run for an invalid output budget.");
  });
  const gateway = createVercelAiGateway({ model: "google/gemini-2.5-flash" });
  for (const maxOutputTokens of [24_001, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    await assert.rejects(
      gateway.transport.generateStructured({
        schema: { type: "object" },
        system: "Extract document",
        user: {
          text: "Extract",
          bytes: new Uint8Array(),
          mediaType: "application/pdf",
        },
        maxOutputTokens,
        timeoutMs: 105_000,
      }),
      /Output token limit must be an integer between 1 and 24000/,
    );
  }
  assert.equal(fetch.mock.callCount(), 0);
});
