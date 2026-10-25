import assert from "node:assert/strict";
import test from "node:test";
import { parseProcessingOutput } from "./ai-gateway.mjs";

const valid = {
  documentKind: "receipt",
  observations: [
    {
      id: "total",
      label: "Total",
      value: "1260",
      source: { page: 1 },
      uncertain: false,
    },
  ],
};

test("AI Gateway accepts a bounded, domain-shaped processing result", () => {
  assert.deepEqual(parseProcessingOutput(valid), valid);
});

test("AI Gateway rejects malformed observations before they reach Intelligence", () => {
  assert.throws(
    () => parseProcessingOutput({ ...valid, observations: [{ ...valid.observations[0], uncertain: "false" }] }),
    /invalid result/,
  );
  assert.throws(
    () => parseProcessingOutput({ ...valid, observations: [{ ...valid.observations[0], source: [] }] }),
    /invalid result/,
  );
});
