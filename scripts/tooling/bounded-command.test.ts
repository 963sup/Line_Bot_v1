import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runBoundedCommand } from "./bounded-command.ts";

test("writes complete output to an artifact and returns a bounded success summary", async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), "bounded-command-"));
  const result = await runBoundedCommand({
    artifactDir,
    command: [process.execPath, "-e", "console.log('one'); console.error('two')"],
    label: "success-case",
  });

  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.changed, true);
  assert.deepEqual(result.tail, []);
  assert.match(await readFile(result.artifact, "utf8"), /one[\s\S]*two/);
});

test("returns the first actionable error and only the configured tail on failure", async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), "bounded-command-"));
  const result = await runBoundedCommand({
    artifactDir,
    command: [
      process.execPath,
      "-e",
      "console.log('noise'); console.error('Error: actionable failure'); console.error('detail-a'); console.error('detail-b'); process.exit(7)",
    ],
    label: "failure-case",
    tailLines: 2,
  });

  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 7);
  assert.equal(result.firstActionableError, "Error: actionable failure");
  assert.deepEqual(result.tail, ["detail-a", "detail-b"]);
});

test("deduplicates identical completed poll results without suppressing the artifact", async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), "bounded-command-"));
  const input = {
    artifactDir,
    command: [process.execPath, "-e", "console.log('pending')"],
    dedupeKey: "pr-418-checks",
    label: "pr-checks",
  };

  const first = await runBoundedCommand(input);
  const second = await runBoundedCommand(input);

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.notEqual(first.artifact, second.artifact);
});
