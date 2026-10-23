import assert from "node:assert/strict";
import test from "node:test";
import { createGatewayTextGenerator } from "../src/adapters/outbound/external-api/vercel-ai.js";

test("gateway requires explicit credentials and model", () => {
  assert.throws(
    () => createGatewayTextGenerator({ apiKey: "", model: "openai/gpt-4.1" }),
    /AI_GATEWAY_API_KEY/,
  );
  assert.throws(
    () => createGatewayTextGenerator({ apiKey: "test-key", model: "" }),
    /AI_GATEWAY_MODEL/,
  );
  assert.throws(
    () => createGatewayTextGenerator({ apiKey: "test-key", model: "bad-model" }),
    /Invalid AI_GATEWAY_MODEL/,
  );
  assert.equal(
    typeof createGatewayTextGenerator({ apiKey: "test-key", model: "google/gemini-2.5-flash" }),
    "function",
  );
});
