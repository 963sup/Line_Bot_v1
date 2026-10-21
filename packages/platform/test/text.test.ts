import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeContent } from "../src/text.js";

test("normalizes title edges and preserves the body exactly", () => {
  const body = "  first line\r\nsecond line  ";
  assert.deepEqual(normalizeContent({ title: "  Guide  ", body }), {
    ok: true,
    value: { title: "Guide", body },
  });
});

test("validates title length as JavaScript UTF-16 code units", () => {
  assert.equal(normalizeContent({ title: "   ", body: "" }).ok, false);
  assert.equal(normalizeContent({ title: "😀".repeat(100), body: "" }).ok, true);
  assert.deepEqual(normalizeContent({ title: "😀".repeat(101), body: "" }), {
    ok: false,
    field: "title",
  });
});

test("accepts the body limit and rejects the next code unit", () => {
  const body = "x".repeat(262_144);
  const accepted = normalizeContent({ title: "Guide", body });
  assert.equal(accepted.ok, true);
  if (accepted.ok) assert.equal(accepted.value.body, body);
  assert.deepEqual(normalizeContent({ title: "Guide", body: `${body}x` }), {
    ok: false,
    field: "body",
  });
});

test("reports an invalid title before an invalid body", () => {
  assert.deepEqual(normalizeContent({ title: " ", body: "x".repeat(262_145) }), {
    ok: false,
    field: "title",
  });
});
