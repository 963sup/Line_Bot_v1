import assert from "node:assert/strict";
import test from "node:test";
import { createGatewayTextGenerator } from "../src/adapters/outbound/external-api/vercel-ai.js";

test("gateway validates model ID and delegates API key or OIDC authentication to AI SDK", () => {
  assert.throws(() => createGatewayTextGenerator({ model: "" }), /AI_GATEWAY_MODEL/);
  assert.throws(
    () => createGatewayTextGenerator({ model: "bad-model" }),
    /Invalid AI_GATEWAY_MODEL/,
  );
  assert.equal(typeof createGatewayTextGenerator({ model: "google/gemini-2.5-flash" }), "function");
});
