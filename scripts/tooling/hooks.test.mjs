import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { context, patchPaths } from "../../.codex/hooks/runtime.mjs";

const hooks = fileURLToPath(new URL("../../.codex/hooks/", import.meta.url));
function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "codex-hooks-test-"));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  mkdirSync(resolve(root, "scripts"));
  writeFileSync(
    resolve(root, "scripts/check.mjs"),
    `import {appendFileSync,existsSync} from 'node:fs'; appendFileSync('.calls', JSON.stringify(process.argv.slice(2))+'\\n'); process.exitCode=existsSync('.fail')?1:0;`,
  );
  writeFileSync(resolve(root, "sample.js"), "export const value = 1;\n");
  writeFileSync(resolve(root, ".gitignore"), ".artifacts/\n");
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Hook Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    ],
    { cwd: root },
  );
  const event = {
    cwd: root,
    session_id: "session",
    turn_id: "turn",
    tool_name: "apply_patch",
    tool_use_id: "edit-1",
    tool_input: { command: "*** Update File: sample.js\n" },
  };
  return { root, event };
}
function invoke(script, event) {
  const result = spawnSync(process.execPath, [resolve(hooks, `${script}.mjs`)], {
    input: JSON.stringify(event),
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
function calls(root) {
  return readFileSync(resolve(root, ".calls"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

test("patch scope includes rename/deletion and rejects outside or artifact paths", () => {
  assert.deepEqual(
    patchPaths(
      "*** Update File: a.js\n*** Move to: b.js\n*** Delete File: c.js\n*** Add File: ../escape.js\n*** Add File: .artifacts/no.js\n",
      "/repo",
      "/repo",
    ),
    ["a.js", "b.js", "c.js"],
  );
});
test("read-only turns do not execute checks", () => {
  const { root, event } = fixture();
  assert.deepEqual(invoke("verify-turn", event), {});
  assert.throws(() => calls(root), { code: "ENOENT" });
});
test("scoped checks deduplicate evidence and invalidate it when file content changes", () => {
  const { root, event } = fixture();
  invoke("track-changes", event);
  assert.match(invoke("verify-turn", event).systemMessage, /2\/2 passed/);
  assert.deepEqual(calls(root), [
    ["patch", "--", "HEAD", "--", "sample.js"],
    ["lint", "--", "./sample.js"],
  ]);
  assert.deepEqual(invoke("verify-turn", event), {});
  assert.equal(calls(root).length, 2);
  writeFileSync(resolve(root, "sample.js"), "export const value = 2;\n");
  invoke("verify-turn", event);
  assert.equal(calls(root).length, 4);
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Hook Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "--quiet",
      "--allow-empty",
      "-m",
      "new revision",
    ],
    { cwd: root },
  );
  invoke("verify-turn", event);
  assert.equal(calls(root).length, 6);
});
test("failed checks request at most one continuation and keep raw output out of feedback", () => {
  const { root, event } = fixture();
  writeFileSync(resolve(root, ".fail"), "");
  invoke("track-changes", event);
  assert.equal(invoke("verify-turn", event).decision, "block");
  assert.deepEqual(invoke("verify-turn", { ...event, stop_hook_active: true }), {});
  writeFileSync(resolve(root, "sample.js"), "changed again\n");
  assert.match(
    invoke("verify-turn", { ...event, stop_hook_active: true }).systemMessage,
    /no automatic retry/,
  );
  assert.equal(calls(root).length, 2);
});
test("turns are isolated and deleted files do not reach Biome", () => {
  const { root, event } = fixture();
  invoke("track-changes", { ...event, tool_input: { command: "*** Delete File: deleted.js\n" } });
  assert.deepEqual(invoke("verify-turn", { ...event, turn_id: "other" }), {});
  invoke("verify-turn", event);
  assert.deepEqual(calls(root), [["patch", "--", "HEAD", "--", "deleted.js"]]);
});
test("session context reports tracked changes without filenames or file contents", () => {
  const { root, event } = fixture();
  writeFileSync(resolve(root, "sample.js"), "private-content\n");
  const result = invoke("session-context", event);
  const summary = JSON.parse(result.hookSpecificOutput.additionalContext);
  assert.equal(summary.trackedChanges, 1);
  assert.equal(JSON.stringify(result).includes("private-content"), false);
  assert.equal(summary.bootstrapMarker, false);
});

test("prompt preflight delivers bounded guidance and records delivery without private prompt", () => {
  const { root, event } = fixture();
  const result = invoke("requirement-preflight", {
    ...event,
    hook_event_name: "UserPromptSubmit",
    prompt: "private requirement content",
  });
  assert.equal(result.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(result.hookSpecificOutput.additionalContext, /requirement-architect/);
  assert.ok(result.hookSpecificOutput.additionalContext.length < 1000);
  assert.equal(JSON.stringify(result).includes("private requirement content"), false);
  const { base, turn } = context(event);
  const record = readFileSync(resolve(turn ?? base, "requirement-preflight.json"), "utf8");
  assert.equal(JSON.parse(record).event, "UserPromptSubmit");
  assert.equal(record.includes("private requirement content"), false);
  assert.equal(spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).stdout, "");
});

test("prompt preflight reports failed delivery when session identity is missing", () => {
  const { event } = fixture();
  const result = invoke("requirement-preflight", { ...event, session_id: undefined });
  assert.equal(result.hookSpecificOutput, undefined);
  assert.match(result.systemMessage, /could not run/);
});
