import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  runBoundedCommand,
  summarizeGhPrChecks,
  summarizeJsonResponse,
} from "./bounded-command.ts";

test("summarizes GitHub check rows without returning the raw table", () => {
  assert.deepEqual(
    summarizeGhPrChecks(
      [
        "validate\tpass\t27s\thttps://example.test/validate",
        "Vercel\tpending\t0\thttps://example.test/vercel\tDeploying",
        "lint\tfail\t12s\thttps://example.test/lint\tBiome failed",
      ].join("\n"),
    ),
    {
      failed: ["lint"],
      failing: 1,
      passing: 1,
      pending: 1,
      total: 3,
    },
  );
});

test("projects only selected JSON values and counts arrays", () => {
  assert.deepEqual(
    summarizeJsonResponse(
      JSON.stringify({
        id: "response-1",
        items: [
          { id: "a", secret: "hidden" },
          { id: "b", secret: "hidden" },
        ],
        metadata: { cursor: "next", internal: "not returned" },
      }),
      ["id", "items[].id", "metadata"],
    ),
    {
      kind: "json",
      root: "object",
      selected: {
        id: "response-1",
        "items[].id": { count: 2, values: ["a", "b"] },
        metadata: { keys: ["cursor", "internal"] },
      },
      topLevelKeys: ["id", "items", "metadata"],
    },
  );
});

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

test("treats GitHub pending checks as a structured probe instead of a command failure", async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), "bounded-command-"));
  const result = await runBoundedCommand({
    artifactDir,
    command: [
      process.execPath,
      "-e",
      "console.log('validate\\tpending\\t0\\thttps://example.test'); process.exit(1)",
    ],
    label: "pending-checks",
    summaryMode: "gh-pr-checks",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.summary, {
    failed: [],
    failing: 0,
    passing: 0,
    pending: 1,
    total: 1,
  });
  assert.deepEqual(result.tail, []);
});

test("bounds failure excerpts and suppresses repeated failure details", async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), "bounded-command-"));
  const input = {
    artifactDir,
    command: [
      process.execPath,
      "-e",
      "console.error('Error: ' + 'x'.repeat(10000)); process.exit(1)",
    ],
    dedupeKey: "repeated-failure",
    label: "repeated-failure",
  };

  const first = await runBoundedCommand(input);
  const second = await runBoundedCommand(input);

  assert.ok((first.firstActionableError?.length ?? 0) <= 1040);
  assert.ok(first.tail.join("\n").length <= 4096);
  assert.equal(second.changed, false);
  assert.equal(second.firstActionableError, undefined);
  assert.deepEqual(second.tail, []);
});

test("streams a large command response to the artifact without exposing it in the summary", async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), "bounded-command-"));
  const result = await runBoundedCommand({
    artifactDir,
    command: [process.execPath, "-e", "process.stdout.write('x'.repeat(2_000_000))"],
    label: "large-output",
  });

  assert.equal(result.ok, true);
  assert.equal(result.tail.length, 0);
  assert.equal((await stat(result.artifact)).size, 2_000_000);
});
