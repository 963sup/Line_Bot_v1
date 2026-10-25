import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { executeValidationCommand, parseValidationCommand } from "./validation-command.mjs";

function fixturePnpm(cwd) {
  const path = join(cwd, "fixture-pnpm.mjs");
  writeFileSync(
    path,
    `import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, process.argv.slice(2), { stdio: "inherit" });
process.exit(result.status ?? 1);
`,
  );
  return path;
}

test("validation command requires a label and explicit pnpm arguments", () => {
  assert.throws(() => parseValidationCommand([]), /Usage/);
  assert.throws(() => parseValidationCommand(["--label", "check"]), /Usage/);
  assert.deepEqual(parseValidationCommand(["--label", "docs", "--", "docs:check"]), {
    command: ["docs:check"],
    label: "docs",
  });
});

test("validation command keeps full output in an artifact and returns a compact success record", (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "line-bot-validation-command-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const result = executeValidationCommand({
    command: ["-e", "console.log('complete command evidence')"],
    cwd,
    label: "success",
    pnpmExecPath: fixturePnpm(cwd),
  });
  assert.equal(result.ok, true);
  assert.equal(result.diagnostic, "");
  assert.deepEqual(result.command.slice(0, 2), ["pnpm", "-e"]);
  assert.match(readFileSync(result.logPath, "utf8"), /complete command evidence/);
});

test("validation command returns only a bounded failure diagnostic", (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "line-bot-validation-command-failure-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const result = executeValidationCommand({
    command: ["-e", "for(let i=0;i<300;i++) console.error(`line-${i}`); process.exit(7)"],
    cwd,
    label: "failure",
    pnpmExecPath: fixturePnpm(cwd),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 7);
  assert.match(result.diagnostic, /line-299/);
  assert.ok(result.diagnostic.split(/\r?\n/).length <= 121);
});
