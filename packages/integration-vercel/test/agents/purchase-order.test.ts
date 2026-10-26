import assert from "node:assert/strict";
import test from "node:test";
import { createPurchaseOrderAgent } from "../../src/agents/purchase-order.js";

test("purchase-order agent owns its structured extraction request", async () => {
  let received: Record<string, unknown> | undefined;
  const agent = createPurchaseOrderAgent({
    model: "google/gemini-2.5-flash",
    gateway: {
      generateStructured: async (input) => {
        received = input;
        return {
          header: {
            documentNumber: null,
            revision: null,
            issueDate: null,
            title: null,
            currency: null,
          },
          buyer: { name: null, registrationNumber: null },
          seller: { name: null, registrationNumber: null },
          lines: [],
          totals: { gross: null, discount: null, net: null, tax: null, total: null },
          terms: { text: null, sourcePages: [] },
          fieldEvidence: {},
          corrections: [],
        };
      },
    },
  });

  await agent.documentExtractor().extract({
    bytes: new Uint8Array([1]),
    mediaType: "application/pdf",
    schema: { id: "purchase-order/v1", version: 1, schema: { type: "object" } },
  });

  assert.equal(agent.documentExtractor().version, "purchase-order-v1:google/gemini-2.5-flash");
  assert.equal(received?.maxOutputTokens, 24_000);
  assert.equal(received?.timeoutMs, 45_000);
  assert.match(String(received?.system), /untrusted data/);
});

test("purchase-order agent rejects unsupported source media", async () => {
  const agent = createPurchaseOrderAgent({
    model: "google/gemini-2.5-flash",
    gateway: { generateStructured: async () => ({}) },
  });
  await assert.rejects(
    agent.documentExtractor().extract({
      bytes: new Uint8Array(),
      mediaType: "text/plain",
      schema: { id: "purchase-order/v1", version: 1, schema: {} },
    }),
    /not supported/,
  );
});
