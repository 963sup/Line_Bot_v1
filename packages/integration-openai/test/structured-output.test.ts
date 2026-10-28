import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { createOpenAIStructuredOutput, OpenAIOutputError } from "../src/structured-output.js";

const document = await PDFDocument.create();
document.addPage();
const pdfBytes = await document.save();

const input = {
  schema: { type: "object", additionalProperties: false, properties: {}, required: [] },
  system: "extract",
  text: "source",
  bytes: pdfBytes,
  mediaType: "application/pdf",
  maxInputBytes: 558_512,
  maxPdfPages: 24,
  maxOutputTokens: 100,
  timeoutMs: 1000,
};
test("Responses request uses strict schema, private PDF data, no storage and direct OpenAI auth", async () => {
  let calls = 0;
  const provider = createOpenAIStructuredOutput({
    model: "gpt-4.1",
    apiKey: () => "test-key",
    fetch: async (url, init) => {
      calls++;
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-key");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.store, false);
      assert.equal(body.text.format.strict, true);
      assert.deepEqual(body.text.format.schema, input.schema);
      assert.equal(body.input[0].content[1].type, "input_file");
      return Response.json({
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }],
      });
    },
  });
  assert.deepEqual(await provider.generate(input), {});
  assert.equal(calls, 1);
});
for (const [code, payload] of [
  [
    "REFUSAL",
    {
      status: "completed",
      output: [{ type: "message", content: [{ type: "refusal", refusal: "private" }] }],
    },
  ],
  ["INCOMPLETE", { status: "incomplete", output: [] }],
  ["INVALID_OUTPUT", { status: "completed", output: [] }],
  [
    "INVALID_OUTPUT",
    {
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: "broken" }] }],
    },
  ],
] as const)
  test(`rejects ${code} without leaking provider content`, async () => {
    const provider = createOpenAIStructuredOutput({
      model: "gpt-4.1",
      apiKey: () => "test-key",
      fetch: async () => Response.json(payload),
    });
    await assert.rejects(
      provider.generate(input),
      (error: unknown) => error instanceof OpenAIOutputError && error.code === code,
    );
  });
test("provider error is not retried", async () => {
  let calls = 0;
  const provider = createOpenAIStructuredOutput({
    model: "gpt-4.1",
    apiKey: () => "test-key",
    fetch: async () => {
      calls++;
      return new Response("secret", { status: 429 });
    },
  });
  await assert.rejects(provider.generate(input), /UNAVAILABLE/);
  assert.equal(calls, 1);
});

test("images use input_image while invalid budgets never dispatch", async () => {
  let calls = 0;
  const provider = createOpenAIStructuredOutput({
    model: "gpt-4.1",
    apiKey: () => "test-key",
    fetch: async (_url, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.input[0].content[1].type, "input_image");
      assert.match(body.input[0].content[1].image_url, /^data:image\/png;base64,/);
      return Response.json({
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }],
      });
    },
  });
  await provider.generate({ ...input, bytes: new Uint8Array([1, 2]), mediaType: "image/png" });
  await assert.rejects(provider.generate({ ...input, maxOutputTokens: 24001 }), RangeError);
  assert.equal(calls, 1);
});

test("oversized inputs and PDFs over 24 pages never dispatch", async () => {
  let calls = 0;
  const provider = createOpenAIStructuredOutput({
    model: "gpt-4.1",
    apiKey: () => "test-key",
    fetch: async () => {
      calls++;
      return Response.json({});
    },
  });
  await assert.rejects(
    provider.generate({ ...input, bytes: new Uint8Array(558_513) }),
    /input byte budget/,
  );
  const longDocument = await PDFDocument.create();
  for (let page = 0; page < 25; page++) longDocument.addPage();
  await assert.rejects(
    provider.generate({ ...input, bytes: await longDocument.save() }),
    /page budget/,
  );
  assert.equal(calls, 0);
});

test("network failure is redacted without retry", async () => {
  let calls = 0;
  const provider = createOpenAIStructuredOutput({
    model: "gpt-4.1",
    apiKey: () => "test-key",
    fetch: async () => {
      calls++;
      throw new Error("sensitive transport message");
    },
  });
  await assert.rejects(
    provider.generate(input),
    (error) =>
      error instanceof OpenAIOutputError &&
      error.code === "UNAVAILABLE" &&
      !error.message.includes("sensitive"),
  );
  assert.equal(calls, 1);
});
