import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { createOpenAIStructuredOutput, OpenAIOutputError } from "../src/structured-output.js";

test("input token admission counts the same complete PDF/schema/instructions payload used for generation", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = await pdf.save();
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const provider = createOpenAIStructuredOutput({
    model: "gpt-4.1",
    apiKey: () => "test-key",
    fetch: async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return String(url).endsWith("/input_tokens")
        ? Response.json({ object: "response.input_tokens", input_tokens: 123 })
        : Response.json({
            status: "completed",
            output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }],
          });
    },
  });
  const input = {
    schema: { type: "object", additionalProperties: false, properties: {}, required: [] },
    system: "all fields",
    text: "extract complete",
    bytes,
    mediaType: "application/pdf",
    maxInputBytes: 558512,
    maxPdfPages: 24,
    maxOutputTokens: 24000,
    timeoutMs: 1000,
  };
  assert.equal(await provider.countInputTokens(input), 123);
  await provider.generate(input);
  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.url, "https://api.openai.com/v1/responses/input_tokens");
  for (const key of ["model", "input", "instructions", "text"])
    assert.deepEqual(requests[0]?.body[key], requests[1]?.body[key]);
  assert.equal(requests[1]?.body.store, false);
});
test("token count invalid and unavailable responses fail closed without implicit retry", async () => {
  const input = {
    schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    system: "extract",
    text: "source",
    bytes: new Uint8Array([1]),
    mediaType: "image/png",
    maxInputBytes: 558512,
    maxPdfPages: 24,
    maxOutputTokens: 24000,
    timeoutMs: 1000,
  };
  for (const payload of [
    { input_tokens: -1 },
    { input_tokens: 1.5 },
    { input_tokens: "100" },
    {},
  ]) {
    let calls = 0;
    const provider = createOpenAIStructuredOutput({
      model: "gpt-4.1",
      apiKey: () => "test",
      fetch: async () => {
        calls++;
        return Response.json(payload);
      },
    });
    await assert.rejects(provider.countInputTokens(input), OpenAIOutputError);
    assert.equal(calls, 1);
  }
  let calls = 0;
  const provider = createOpenAIStructuredOutput({
    model: "gpt-4.1",
    apiKey: () => "test",
    fetch: async () => {
      calls++;
      throw new Error("offline");
    },
  });
  await assert.rejects(provider.countInputTokens(input), OpenAIOutputError);
  assert.equal(calls, 1);
});
