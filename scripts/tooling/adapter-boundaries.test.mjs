import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
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
