import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("public Repository root wires interaction gating without changing the authenticated branch", () => {
  const source = readFileSync(
    new URL("../src/app/(resource)/[login]/[repository]/page.tsx", import.meta.url),
    "utf8",
  );
  const controls = [...source.matchAll(/<RepositorySubscriptionControl[\s\S]*?\/>/g)].map(
    (match) => match[0],
  );
  assert.equal(controls.length, 2);
  assert.match(controls[0] ?? "", /explicitInteraction/);
  assert.doesNotMatch(controls[1] ?? "", /explicitInteraction/);
});
