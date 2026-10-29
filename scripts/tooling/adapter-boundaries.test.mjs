import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
test("canonical adapter boundary permits own composition but rejects foreign packages and apps", () => {
  const suffix = `__boundary_${randomUUID().replaceAll("-", "")}.mjs`;
  const adapter = `packages/contract/src/adapters/${suffix}`;
  const own = `packages/contract/src/composition/${suffix}`;
  const foreign = `packages/intelligence/src/application/${suffix}`;
  const app = `apps/web/src/app/api/_composition/${suffix}`;
  const files = [adapter, own, foreign, app];
  try {
    writeFileSync(resolve(root, adapter), "export const boundaryFixture = 1;\n");
    for (const source of [own, foreign, app]) {
      let specifier = relative(dirname(source), adapter).replaceAll("\\", "/");
      if (!specifier.startsWith(".")) specifier = `./${specifier}`;
      writeFileSync(
        resolve(root, source),
        `import { boundaryFixture } from ${JSON.stringify(specifier)};\nexport const value = boundaryFixture;\n`,
      );
    }
    const result = spawnSync(
      resolve(root, "node_modules/.bin/depcruise"),
      ["--config", ".dependency-cruiser.mjs", "--output-type", "json", own, foreign, app],
      { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 },
    );
    assert.ok([0, 3].includes(result.status), result.stderr);
    const report = JSON.parse(result.stdout);
    const violations = report.summary.violations.filter((item) =>
      ["adapters-are-private-implementations", "apps-do-not-import-package-adapters"].includes(
        item.rule.name,
      ),
    );
    assert.equal(
      violations.some((item) => item.from === own),
      false,
      "Owning composition must be able to wire its adapter.",
    );
    assert.ok(
      violations.some((item) => item.from === foreign),
      "Foreign package must not access private adapter.",
    );
    assert.ok(
      violations.some((item) => item.from === app),
      "Application host must consume package exports, not private adapters.",
    );
  } finally {
    for (const file of files) rmSync(resolve(root, file), { force: true });
  }
});

test("Contract and WBS cannot import Content bootstrap outside host composition", () => {
  const suffix = `__boundary_${randomUUID().replaceAll("-", "")}.mjs`;
  const target = `packages/content/src/composition/bootstrap/${suffix}`;
  const contract = `packages/contract/src/composition/${suffix}`;
  const wbs = `packages/wbs/src/composition/${suffix}`;
  const host = `apps/web/src/app/api/_composition/${suffix}`;
  const fixtures = [target, contract, wbs, host];
  const sourceImport = (from) => {
    let specifier = relative(dirname(from), target).replaceAll("\\", "/");
    if (!specifier.startsWith(".")) specifier = `./${specifier}`;
    return `import ${JSON.stringify(specifier)};\n`;
  };
  try {
    writeFileSync(resolve(root, target), "export const fixture = true;\n");
    for (const from of [contract, wbs, host])
      writeFileSync(resolve(root, from), sourceImport(from));
    const result = spawnSync(
      resolve(root, "node_modules/.bin/depcruise"),
      ["--config", ".dependency-cruiser.mjs", "--output-type", "json", contract, wbs, host],
      { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 },
    );
    assert.ok([0, 3].includes(result.status), result.stderr);
    const violations = JSON.parse(result.stdout).summary.violations;
    const forbidden = (from) =>
      violations.some(
        (item) =>
          item.from === from &&
          item.rule.name === "contract-and-wbs-do-not-compose-content-internally",
      );
    assert.ok(forbidden(contract), "Contract must delegate Content wiring to the Host.");
    assert.ok(forbidden(wbs), "WBS must delegate Content wiring to the Host.");
    assert.equal(forbidden(host), false, "Host composition may wire Content providers.");
  } finally {
    for (const file of fixtures) rmSync(resolve(root, file), { force: true });
  }
});

test("Discussion read adapter does not import Repository concrete persistence", () => {
  const source = readFileSync(resolve(root, "packages/discussion/src/adapters/postgres.ts"), "utf8");
  assert.doesNotMatch(source, /@line_bot_v1\/repository\/(?:postgres|composition\/bootstrap)/);
});

test("Contract and Intelligence use Host-composed File ports, not foreign bootstrap", () => {
  const suffix = `__boundary_${randomUUID().replaceAll("-", "")}.mjs`;
  const file = `packages/file/src/composition/bootstrap/${suffix}`;
  const intelligence = `packages/intelligence/src/composition/bootstrap/${suffix}`;
  const contract = `packages/contract/src/composition/bootstrap/${suffix}`;
  const host = `apps/web/src/app/api/_composition/${suffix}`;
  const fixtures = [file, intelligence, contract, host];
  const sourceImport = (from) => {
    let specifier = relative(dirname(from), file).replaceAll("\\", "/");
    if (!specifier.startsWith(".")) specifier = `./${specifier}`;
    return `import ${JSON.stringify(specifier)};\n`;
  };
  try {
    writeFileSync(resolve(root, file), "export const fixture = true;\n");
    for (const from of [intelligence, contract, host]) writeFileSync(resolve(root, from), sourceImport(from));
    const run = spawnSync(
      resolve(root, "node_modules/.bin/depcruise"),
      ["--config", ".dependency-cruiser.mjs", "--output-type", "json", intelligence, contract, host],
      { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 },
    );
    assert.ok([0, 3].includes(run.status), run.stderr);
    const report = JSON.parse(run.stdout);
    const violated = (from, rule) => report.summary.violations.some(
      (item) => item.from === from && item.rule.name === rule,
    );
    assert.ok(violated(intelligence, "intelligence-bootstrap-does-not-compose-file-bootstrap"));
    assert.ok(violated(contract, "contract-bootstrap-does-not-compose-file-bootstrap"));
    assert.equal(violated(host, "intelligence-bootstrap-does-not-compose-file-bootstrap"), false);
    assert.equal(violated(host, "contract-bootstrap-does-not-compose-file-bootstrap"), false);
  } finally {
    for (const entry of fixtures) rmSync(resolve(root, entry), { force: true });
  }
});

test("Content composition depends on a narrow Resource port, not Resources bootstrap", () => {
  const source = readFileSync(resolve(root, "packages/content/src/composition/bootstrap/plans.ts"), "utf8");
  assert.doesNotMatch(source, /@line_bot_v1\/resources\/composition\/bootstrap/);
  assert.match(source, /resourceReader/);
});
