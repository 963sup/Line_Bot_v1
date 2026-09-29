import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkAppRoot, checkArchitecture } from "./check-architecture.mjs";
import { validatePackageExports } from "./check-implementation-topology.mjs";

const artifacts = fileURLToPath(new URL("../../.artifacts/", import.meta.url));
// Keep generated fixture imports out of the tooling checker's literal script-import scan.
const importing = (specifier) => `import ${JSON.stringify(specifier)};`;
const wildcardReExporting = (specifier) => `export * from ${JSON.stringify(specifier)};`;
const namedReExporting = (name, specifier) =>
  `export { ${name} } from ${JSON.stringify(specifier)};`;
function write(root, path, text) {
  const file = resolve(root, path);
  mkdirSync(resolve(file, ".."), { recursive: true });
  writeFileSync(file, text);
}

test("inner layers reject composition, persistence, Node, SDK and environment dependencies", async () => {
  mkdirSync(artifacts, { recursive: true });
  const root = mkdtempSync(resolve(artifacts, "inner-boundaries-"));
  try {
    mkdirSync(resolve(root, "apps"));
    write(root, "packages/demo/package.json", JSON.stringify({ name: "@line_bot_v1/demo" }));
    write(root, "packages/demo/tsconfig.json", "{}");
    write(root, "packages/demo/src/domain/value.ts", "export const value = 1;");
    write(root, "packages/demo/src/adapters/private.ts", importing("node:fs"));
    write(root, "packages/demo/src/composition/bootstrap.ts", importing("../adapters/private.js"));
    write(root, "packages/demo/src/postgres.ts", importing("./adapters/private.js"));
    write(root, "node_modules/provider-sdk/package.json", JSON.stringify({ name: "provider-sdk", main: "index.js" }));
    write(root, "node_modules/provider-sdk/index.js", "exports.client = {};");
    assert.deepEqual((await checkArchitecture(root)).errors, [], "outer layers may own runtime dependencies");
    const scenarios = [
      ["domain", importing("node:fs"), "context-domain-does-not-import-runtime"],
      ["domain", importing("provider-sdk"), "context-domain-does-not-import-runtime"],
      ["domain", importing("../composition/bootstrap.js"), "context-domain-does-not-import-outer-layers"],
      ["domain", importing("../postgres.js"), "context-domain-does-not-import-outer-layers"],
      ["contracts", importing("../composition/bootstrap.js"), "context-contracts-do-not-import-implementation"],
      ["application", importing("../composition/bootstrap.js"), "context-application-does-not-import-adapters"],
      ["application", importing("../postgres.js"), "context-application-does-not-import-adapters"],
      ...[
        "export const value = process.env.MODE;",
        "export const value = process['env']['MODE'];",
        "export const value = globalThis.process.env.MODE;",
        "const { env: settings } = process; export const value = settings.MODE;",
        "export const value = import.meta.env.MODE;",
      ].map((content) => ["domain", content, "domain-does-not-read-environment"]),
    ];
    for (const [layer, content, rule] of scenarios) {
      const file = `packages/demo/src/${layer}/probe.ts`;
      write(root, file, content);
      assert.ok((await checkArchitecture(root)).errors.some((error) => error.startsWith(`${rule}:`)), content);
      write(root, file, "export const value = 1;");
      assert.deepEqual((await checkArchitecture(root)).errors, [], "repair restores the legal boundary");
    }
  } finally {
    assert.equal(resolve(root, ".."), resolve(artifacts));
    rmSync(root, { recursive: true, force: true });
  }
});

test("package public exports keep adapters private", () => {
  assert.deepEqual(
    validatePackageExports("@line_bot_v1/demo", {
      ".": { default: "./dist/index.js" },
      "./postgres": { default: "./dist/postgres.js" },
    }),
    [],
  );
  assert.deepEqual(
    validatePackageExports("@line_bot_v1/demo", {
      "./adapters/postgres": { default: "./dist/adapters/postgres.js" },
    }),
    ["@line_bot_v1/demo: private adapter must not be package export: ./adapters/postgres"],
  );
  assert.deepEqual(
    validatePackageExports("@line_bot_v1/demo", {
      "./postgres": { default: "./dist/postgres.js" },
    }),
    [],
  );
});

test("public package entries require named re-exports", async () => {
  mkdirSync(artifacts, { recursive: true });
  const root = mkdtempSync(resolve(artifacts, "named-exports-"));
  try {
    for (const parent of ["apps", "packages"])
      mkdirSync(resolve(root, parent), { recursive: true });
    write(
      root,
      "packages/demo/package.json",
      JSON.stringify({
        name: "@line_bot_v1/demo",
        exports: { ".": { default: "./dist/index.js" } },
      }),
    );
    write(root, "packages/demo/tsconfig.json", JSON.stringify({}));
    write(root, "packages/demo/src/value.ts", "export const value = 1;");
    write(root, "packages/demo/src/index.ts", wildcardReExporting("./value.js"));
    assert.ok(
      (await checkArchitecture(root)).errors.some((error) =>
        error.startsWith("public-exports-are-named: @line_bot_v1/demo -> ./value.js"),
      ),
    );
    write(root, "packages/demo/src/index.ts", namedReExporting("value", "./value.js"));
    assert.equal(
      (await checkArchitecture(root)).errors.some((error) =>
        error.startsWith("public-exports-are-named:"),
      ),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adapter privacy applies across workspace owners, not within one owner", async () => {
  mkdirSync(artifacts, { recursive: true });
  const root = mkdtempSync(resolve(artifacts, "adapter-owner-"));
  try {
    for (const parent of ["apps", "packages"])
      mkdirSync(resolve(root, parent), { recursive: true });

    write(
      root,
      "packages/demo/package.json",
      JSON.stringify({
        name: "@line_bot_v1/demo",
        exports: { ".": { default: "./dist/index.js" } },
      }),
    );
    write(root, "packages/demo/tsconfig.json", JSON.stringify({}));
    write(root, "packages/demo/src/index.ts", "export const value = 1;");
    write(root, "packages/demo/src/adapters/private.ts", "export const privateValue = 1;");
    write(root, "packages/demo/src/adapters/peer.ts", importing("./private"));

    write(
      root,
      "apps/web/package.json",
      JSON.stringify({ name: "@line_bot_v1/web", private: true }),
    );
    write(root, "apps/web/tsconfig.json", JSON.stringify({}));
    write(root, "apps/web/src/index.ts", "export const value = 1;");

    assert.equal(
      (await checkArchitecture(root)).errors.some((error) =>
        error.startsWith("adapters-are-private-implementations:"),
      ),
      false,
      "same-owner adapter composition is package-private implementation detail",
    );

    write(root, "apps/web/src/index.ts", importing("../../../packages/demo/src/adapters/private"));
    assert.ok(
      (await checkArchitecture(root)).errors.some((error) =>
        error.startsWith("adapters-are-private-implementations:"),
      ),
      "external workspace must not import a private adapter",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("app root rejects unexpected folders, new root files and wrong entry kinds", () => {
  mkdirSync(artifacts, { recursive: true });
  const root = mkdtempSync(resolve(artifacts, "app-root-"));
  const app = resolve(root, "apps/web/src/app");
  try {
    for (const folder of [
      "(admin)",
      "(mobile)",
      "(onboarding)",
      "(public)",
      "(resource)",
      "(rich-menu)",
      "(system)",
      "_shell",
      "api",
    ])
      mkdirSync(resolve(app, folder), { recursive: true });
    for (const file of ["layout.tsx", "global-error.tsx", "globals.css", "AGENTS.md"])
      write(root, `apps/web/src/app/${file}`, "");
    write(
      root,
      "apps/web/src/app/(system)/auth/callback/page.tsx",
      "export default function Page() {}",
    );
    assert.deepEqual(checkAppRoot(root), []);
    for (const folder of ["auth", "membership", "(other)", "@modal", ".hidden"]) {
      mkdirSync(resolve(app, folder));
      assert.deepEqual(checkAppRoot(root), [`app-root-allowlist: apps/web/src/app/${folder}`]);
      rmSync(resolve(app, folder), { recursive: true });
    }
    write(root, "apps/web/src/app/page.tsx", "");
    assert.deepEqual(checkAppRoot(root), ["app-root-allowlist: apps/web/src/app/page.tsx"]);
    rmSync(resolve(app, "page.tsx"));
    rmSync(resolve(app, "layout.tsx"));
    mkdirSync(resolve(app, "layout.tsx"));
    assert.deepEqual(checkAppRoot(root), ["app-root-allowlist: apps/web/src/app/layout.tsx"]);
  } finally {
    assert.equal(resolve(root, ".."), resolve(artifacts));
    rmSync(root, { recursive: true, force: true });
  }
});

test("architecture checks source exports, types, ports, browser reachability and cycles without dist", async () => {
  mkdirSync(artifacts, { recursive: true });
  const root = mkdtempSync(resolve(artifacts, "architecture-"));
  try {
    for (const name of ["account", "team", "attendance", "platform", "line-channel"]) {
      write(
        root,
        `packages/${name}/package.json`,
        JSON.stringify({
          name: `@line_bot_v1/${name}`,
          exports: {
            ".": { default: "./dist/index.js" },
            "./ports/repository": { default: "./dist/ports/repository.js" },
            ...(name === "line-channel"
              ? {
                  "./mini-app/browser": {
                    default: "./dist/mini-app/browser.js",
                  },
                }
              : {}),
          },
        }),
      );
      write(
        root,
        `packages/${name}/tsconfig.json`,
        JSON.stringify({ extends: "../../tsconfig.base.json" }),
      );
      write(root, `packages/${name}/src/index.ts`, "export type Value = string;");
      write(
        root,
        `packages/${name}/src/ports/repository.ts`,
        "export type Repository = { read(): string };",
      );
    }
    for (const name of ["web", "other"]) {
      write(
        root,
        `apps/${name}/package.json`,
        JSON.stringify({ name: `@line_bot_v1/${name}`, private: true }),
      );
      write(
        root,
        `apps/${name}/tsconfig.json`,
        JSON.stringify({ extends: "../../tsconfig.base.json" }),
      );
      write(root, `apps/${name}/src/index.ts`, "export const value = 1;");
    }
    write(
      root,
      "packages/attendance/src/index.ts",
      "import type { Value } from '@line_bot_v1/account'; export type Result = Value;",
    );
    write(root, "packages/platform/src/index.ts", "export type Store = string;");
    write(
      root,
      "apps/web/src/index.ts",
      "import type { Result } from '@line_bot_v1/attendance'; export type Response = Result;",
    );
    assert.deepEqual(
      (await checkArchitecture(root)).errors,
      [],
      "allowed imports must resolve to source before any build",
    );
    write(root, "packages/config/AGENTS.md", "# Rules alone are not a workspace");
    await assert.rejects(checkArchitecture(root), /source workspace requires package.json/);
    rmSync(resolve(root, "packages/config"), { recursive: true });
    write(
      root,
      "packages/config/package.json",
      JSON.stringify({ name: "@line_bot_v1/config", private: true }),
    );
    await assert.rejects(checkArchitecture(root), /source workspace requires tsconfig.json/);
    rmSync(resolve(root, "packages/config"), { recursive: true });
    write(
      root,
      "packages/config/package.json",
      JSON.stringify({ name: "@line_bot_v1/config", private: true }),
    );
    write(
      root,
      "packages/config/tsconfig.json",
      JSON.stringify({ extends: "../../tsconfig.base.json", files: [], references: [] }),
    );
    assert.deepEqual((await checkArchitecture(root)).errors, []);
    rmSync(resolve(root, "packages/config"), { recursive: true });
    write(root, "packages/platform/src/testing/postgres.ts", "export const fixture = 1;");
    write(root, "packages/attendance/src/adapters/private.ts", "export const adapter = 1;");

    write(root, "apps/web/src/app/(mobile)/home/page.tsx", "export default function Page() {}");
    write(
      root,
      "apps/web/src/app/(mobile)/_shell/app-shell.tsx",
      "export default function Shell() {}",
    );
    write(
      root,
      "apps/web/src/app/(onboarding)/membership/register/page.tsx",
      importing("../../../(mobile)/_shell/app-shell"),
    );
    assert.ok(
      (await checkArchitecture(root)).errors.some((error) =>
        error.startsWith("route-group-does-not-borrow-mobile-shell:"),
      ),
      "onboarding/public/rich-menu/system/admin must not borrow the authenticated mobile shell",
    );
    write(
      root,
      "apps/web/src/app/(onboarding)/membership/register/page.tsx",
      "export default function Page() {}",
    );
    write(root, "apps/web/src/app/(rich-menu)/page.tsx", importing("../(mobile)/_shell/app-shell"));
    assert.ok(
      (await checkArchitecture(root)).errors.some((error) =>
        error.startsWith("route-group-does-not-borrow-mobile-shell:"),
      ),
      "rich-menu must remain independent from the authenticated mobile shell",
    );
    write(root, "apps/web/src/app/(rich-menu)/page.tsx", "export default function Page() {}");
    write(root, "apps/web/src/modules/diary/form.ts", "export const url = 'https://example.test';");
    write(root, "apps/web/src/modules/diary/private.ts", "export const privateValue = 1;");
    write(root, "apps/web/src/shared/browser/session.ts", "export const session = 1;");
    write(root, "apps/web/src/modules/assistant/presenter.ts", importing("../diary/form"));
    write(root, "apps/web/src/modules/attendance/menu.server.ts", "export const showMenu = 1;");
    write(
      root,
      "apps/web/src/modules/assistant/composition.server.ts",
      importing("../attendance/menu.server"),
    );
    assert.ok(
      (await checkArchitecture(root)).errors.some((error) =>
        error.startsWith("modules-use-public-responsibilities:"),
      ),
      "feature composition cannot reach another feature's runtime entry",
    );
    write(root, "apps/web/src/modules/assistant/composition.server.ts", "export const value = 1;");
    write(root, "apps/web/src/modules/account/composition.server.ts", "export const member = 1;");
    write(
      root,
      "apps/web/src/modules/notifications/composition.server.ts",
      importing("../account/composition.server"),
    );
    assert.ok(
      (await checkArchitecture(root)).errors.some((error) =>
        error.startsWith("modules-use-public-responsibilities:"),
      ),
      "feature composition must be assembled outside modules",
    );
    write(
      root,
      "apps/web/src/modules/repository/composition.server.ts",
      importing("../account/composition.server"),
    );
    assert.ok(
      (await checkArchitecture(root)).errors.some((error) =>
        error.startsWith("modules-use-public-responsibilities:"),
      ),
      "all feature compositions use the same boundary",
    );
    write(
      root,
      "apps/web/src/modules/notifications/composition.server.ts",
      "export const value = 1;",
    );
    write(root, "apps/web/src/modules/repository/composition.server.ts", "export const value = 1;");
    const scenarios = [
      [
        "apps/web/src/modules/repository/leak.ts",
        importing("../diary/private"),
        "modules-use-public-responsibilities",
      ],
      [
        "apps/web/src/modules/notifications/leak.ts",
        importing("../diary/private"),
        "modules-use-public-responsibilities",
      ],
      [
        "apps/web/src/modules/account/panel.ts",
        importing("../diary/private"),
        "modules-use-public-responsibilities",
      ],
      [
        "apps/web/src/shared/presentation/leak.ts",
        importing("../browser/session"),
        "presentation-is-environment-independent",
      ],
      [
        "apps/web/src/shared/server/leak.ts",
        importing("../browser/session"),
        "shared-server-does-not-use-browser",
      ],
      [
        "apps/web/src/shared/server/leak.ts",
        "import type { Value } from '@line_bot_v1/account';",
        "shared-server-is-neutral",
      ],
      [
        "apps/web/src/modules/member/panel.ts",
        importing("../../app/api/health/route"),
        "features-do-not-import-routes",
      ],
      [
        "apps/web/src/shared/presentation/leak.ts",
        importing("../../modules/member/panel"),
        "shared-has-no-business-owner",
      ],
      [
        "packages/platform/src/index.ts",
        "import type { Value } from '@line_bot_v1/account';",
        "topology-platform-dependencies",
      ],
      ["packages/platform/src/index.ts", importing("./testing/postgres"), "testing-is-not-runtime"],
      [
        "packages/attendance/src/domain/leak.ts",
        importing("../adapters/private"),
        "context-domain-does-not-import-outer-layers",
      ],
      [
        "packages/attendance/src/contracts/leak.ts",
        importing("../adapters/private"),
        "context-contracts-do-not-import-implementation",
      ],
      [
        "packages/attendance/src/application/leak.ts",
        importing("../adapters/private"),
        "context-application-does-not-import-adapters",
      ],
      [
        "packages/platform/src/private-import.ts",
        importing("../../account/src/index"),
        "no-relative-imports-across-packages",
      ],
      [
        "apps/web/src/features/entry.ts",
        importing("../app/api/health/route"),
        "features-do-not-import-routes",
      ],
      [
        "apps/web/src/index.ts",
        importing("../../../packages/platform/src/testing/postgres"),
        "testing-is-not-runtime",
      ],
      [
        "apps/web/src/app/(system)/old/page.tsx",
        importing("../../(mobile)/home/page"),
        "pages-do-not-import-pages",
      ],
      ["apps/other/src/index.ts", importing("../../web/src/index"), "apps-are-independent"],
      [
        "packages/platform/src/index.ts",
        importing("../../../apps/web/src/index"),
        "packages-do-not-import-apps",
      ],
      ["apps/web/src/index.ts", importing("./missing"), "no-unresolved"],
    ];
    write(
      root,
      "apps/web/src/app/api/health/route.ts",
      "export const GET = () => new Response('ok');",
    );
    for (const [file, content, rule] of scenarios) {
      write(root, file, content);
      assert.ok(
        (await checkArchitecture(root)).errors.some((error) => error.startsWith(`${rule}:`)),
        rule,
      );
      write(root, file, "export const value = 1;");
    }
    write(root, "apps/web/src/server/private.ts", "export const privateValue = 1;");
    for (const file of [
      "modules/member/composition.server.ts",
      "modules/member/server/private.ts",
      "shared/server/http.ts",
      "app/api/_composition/private.server.ts",
    ])
      write(root, `apps/web/src/${file}`, "export type PrivateValue = string;");
    write(
      root,
      "apps/web/src/app/api/health/route.ts",
      "export const GET = () => new Response('ok');",
    );
    write(root, "shared.ts", importing("node:fs"));
    write(root, "apps/web/src/index.ts", `/* comment */ 'use client'; ${importing("./helper")}`);
    for (const target of [
      "./server/private",
      "./modules/member/composition.server",
      "./modules/member/server/private",
      "./shared/server/http",
      "./app/api/_composition/private.server",
      "./app/api/health/route",
      "../../../shared",
      "../../../packages/platform/src/testing/postgres",
      "node:fs",
    ]) {
      write(root, "apps/web/src/helper.ts", `export * from '${target}';`);
      assert.ok(
        (await checkArchitecture(root)).errors.some((error) =>
          error.startsWith("client-cannot-reach-server:"),
        ),
        `client -> helper -> ${target}`,
      );
    }
    write(
      root,
      "apps/web/src/helper.ts",
      `import type { PrivateValue } from ${JSON.stringify("./modules/member/composition.server")}; export type Leaked = PrivateValue;`,
    );
    assert.ok(
      (await checkArchitecture(root)).errors.some((error) =>
        error.startsWith("client-cannot-reach-server:"),
      ),
      "type-only imports do not bypass module server isolation",
    );
    write(root, "packages/line-channel/src/mini-app/browser/client.ts", "export const client = 1;");
    write(
      root,
      "packages/line-channel/src/mini-app/browser.ts",
      `export { client } from ${JSON.stringify("./browser/client")};`,
    );
    write(root, "apps/web/src/helper.ts", importing("@line_bot_v1/line-channel/mini-app/browser"));
    assert.deepEqual((await checkArchitecture(root)).errors, []);
    write(
      root,
      "packages/line-channel/src/adapters/messaging/private.ts",
      "export const value = 1;",
    );
    write(
      root,
      "packages/line-channel/src/adapters/mini-app/server/private.ts",
      "export const value = 1;",
    );
    for (const target of [
      "node:fs",
      "../../adapters/messaging/private",
      "../../adapters/mini-app/server/private",
    ]) {
      write(root, "packages/line-channel/src/mini-app/browser/client.ts", importing(target));
      assert.ok(
        (await checkArchitecture(root)).errors.some((error) =>
          error.startsWith("client-cannot-reach-server:"),
        ),
        target,
      );
    }
    write(root, "packages/line-channel/src/mini-app/browser/client.ts", "export const client = 1;");
    write(root, "packages/platform/dist/old.js", "export const old = 1;");
    write(root, "apps/web/src/helper.ts", importing("../../../packages/platform/dist/old.js"));
    assert.ok(
      (await checkArchitecture(root)).errors.some((error) =>
        error.startsWith("source-does-not-import-build-output:"),
      ),
    );
    write(root, "apps/web/src/index.ts", importing("./helper"));
    write(root, "apps/web/src/helper.ts", importing("./index"));
    assert.ok(
      (await checkArchitecture(root)).errors.some((error) => error.startsWith("no-cycles:")),
    );
  } finally {
    // root is created by mkdtempSync directly under this repository's artifacts directory.
    assert.equal(resolve(root, ".."), resolve(artifacts));
    rmSync(root, { recursive: true, force: true });
  }
});
