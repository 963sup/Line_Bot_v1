import assert from "node:assert/strict";
import { test } from "node:test";
import { appendCursorPage, objectTypeOptions } from "../src/modules/object/object-pagination";

test("Object cursor pagination keeps the 51st item and removes cursor overlap", () => {
  const first = Array.from({ length: 50 }, (_, index) => ({ id: `object-${index + 1}` }));
  const second = [{ id: "object-50" }, { id: "object-51" }];
  const merged = appendCursorPage(first, second, (value) => value.id);
  assert.equal(merged.length, 51);
  assert.equal(merged[50]?.id, "object-51");
});

test("Object detail keeps current Type 51 visible until its cursor page loads", () => {
  const first = Array.from({ length: 50 }, (_, index) => ({
    id: `type-${index + 1}`,
    name: `Type ${index + 1}`,
    enabled: true,
  }));
  const current = { typeId: "type-51", typeName: "Type 51" };
  const beforeLoad = objectTypeOptions(first, current);
  assert.equal(beforeLoad.length, 51);
  assert.deepEqual(beforeLoad[50], {
    id: "type-51",
    name: "Type 51",
    enabled: false,
    current: true,
  });
  const loaded = appendCursorPage(
    first,
    [{ id: "type-51", name: "Type 51", enabled: true }],
    (value) => value.id,
  );
  const afterLoad = objectTypeOptions(loaded, current);
  assert.equal(afterLoad.length, 51);
  assert.deepEqual(afterLoad[50], {
    id: "type-51",
    name: "Type 51",
    enabled: true,
    current: true,
  });
});
