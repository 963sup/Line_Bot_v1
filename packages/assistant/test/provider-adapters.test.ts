import assert from "node:assert/strict";
import { test } from "node:test";
import { createGeminiClient } from "../src/adapters/gemini.js";

test("unconfigured Gemini adapter fails locally with no credentials in the error", () => {
  assert.throws(() => createGeminiClient({ apiKey: " " }), /GEMINI_API_KEY/);
});
