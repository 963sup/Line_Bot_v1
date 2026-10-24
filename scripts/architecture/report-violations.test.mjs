import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { reportArchitectureViolations } from "./report-violations.mjs";

test("architecture reporter preserves complete violations and bounds CLI output", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "architecture-diagnostics-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = [];
  const errors = Array.from({ length: 300 }, (_, index) => `violation-${index}`);
  writeFileSync(join(directory, "architecture.log"), "runner output remains intact");
  reportArchitectureViolations("architecture", errors, {
    outputDirectory: directory,
    write: (line) => output.push(line),
  });
  assert.equal(output.length, 3);
  assert.match(output[0], /300 violations/);
  assert.doesNotMatch(output[1], /^violation-0$/m);
  assert.match(output[1], /violation-299/);
  assert.ok(output[1].split(/\r?\n/).length <= 121);
  assert.match(readFileSync(join(directory, "architecture-violations.log"), "utf8"), /violation-0/);
  assert.equal(
    readFileSync(join(directory, "architecture.log"), "utf8"),
    "runner output remains intact",
  );
  assert.match(output[2], /architecture-violations\.log$/);
});

test("architecture reporter has no side effect for a clean check", () => {
  const output = [];
  reportArchitectureViolations("architecture", [], { write: (line) => output.push(line) });
  assert.deepEqual(output, []);
});
