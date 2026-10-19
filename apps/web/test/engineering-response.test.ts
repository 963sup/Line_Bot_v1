import assert from "node:assert/strict";
import test from "node:test";
import { mergeEngineeringObservations } from "../src/modules/object/engineering-response";

test("joining pages and target scopes preserves old observations and rejects mixed versions", () => {
  const edge = {
    relationshipId: "edge",
    version: 1,
    sourceObjectId: "a",
    targetObjectId: "b",
    kind: "ALLOCATES" as const,
  };
  const first = { objects: [{ objectId: "a", version: 1 }], relationships: [edge] };
  const additional = { objects: [{ objectId: "b", version: 2 }], relationships: [] };
  const merged = mergeEngineeringObservations(first, additional);
  assert.deepEqual(merged.objects, [...first.objects, ...additional.objects]);
  assert.deepEqual(merged.relationships, [edge]);
  assert.throws(() =>
    mergeEngineeringObservations(first, {
      objects: [{ objectId: "a", version: 2 }],
      relationships: [],
    }),
  );
  assert.throws(() =>
    mergeEngineeringObservations(first, { objects: [], relationships: [{ ...edge, version: 2 }] }),
  );
  assert.throws(() =>
    mergeEngineeringObservations(first, {
      objects: [],
      relationships: [{ ...edge, targetObjectId: "c" }],
    }),
  );
});
