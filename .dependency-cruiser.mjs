// Canonical dependency contract: docs/020-architecture/040-dependency-rules.md.
import { readFileSync } from "node:fs";

const topology = JSON.parse(
  readFileSync(new URL("./architecture/implementation-topology.json", import.meta.url), "utf8"),
);

const workspaces = new Map([
  ...Object.entries(topology.modules ?? {}),
  ...Object.entries(topology.applications ?? {}),
]);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function topologyDependencyRules() {
  const paths = new Map([...workspaces].map(([name, entry]) => [name, entry.path]));
  return [...workspaces].flatMap(([name, entry]) => {
    const allowed = new Set([name, ...(entry.allowedWorkspaceDependencies ?? [])]);
    const forbiddenPaths = [...paths]
      .filter(([dependency]) => !allowed.has(dependency))
      .map(([, path]) => escapeRegex(path));
    if (forbiddenPaths.length === 0) return [];
    return [
      {
        name: `topology-${entry.path.split("/").at(-1)}-dependencies`,
        severity: "error",
        from: { path: `^${escapeRegex(entry.path)}/src/` },
        to: { path: `^(?:${forbiddenPaths.join("|")})/src/` },
      },
    ];
  });
}

export default {
  forbidden: [
    ...topologyDependencyRules(),
    {
      name: "features-do-not-import-routes",
      severity: "error",
      from: { path: "^apps/[^/]+/src/(modules|features|components|shared)/" },
      to: { path: "^apps/[^/]+/src/app/" },
    },
    {
      name: "shared-has-no-business-owner",
      severity: "error",
      from: { path: "^apps/[^/]+/src/shared/" },
      to: {
        path: "^apps/[^/]+/src/(modules|features|components|server)/",
      },
    },
    {
      name: "presentation-is-environment-independent",
      severity: "error",
      from: { path: "^apps/[^/]+/src/shared/presentation/" },
      to: { path: "^apps/[^/]+/src/shared/(browser|server)/" },
    },
    {
      name: "shared-server-does-not-use-browser",
      severity: "error",
      from: { path: "^apps/[^/]+/src/shared/server/" },
      to: { path: "^apps/[^/]+/src/shared/browser/" },
    },
    {
      name: "shared-server-is-neutral",
      severity: "error",
      from: { path: "^apps/[^/]+/src/shared/server/" },
      to: { path: "^(packages/|.*node_modules/)" },
    },
    {
      name: "testing-is-not-runtime",
      severity: "error",
      from: { path: "^(apps|packages)/[^/]+/src/", pathNot: "^packages/[^/]+/src/testing/" },
      to: { path: "^packages/[^/]+/src/testing/" },
    },
    {
      name: "pages-do-not-import-pages",
      severity: "error",
      from: { path: "^apps/[^/]+/src/app/.*/page\\.[cm]?[jt]sx?$" },
      to: { path: "^apps/[^/]+/src/app/.*/page\\.[cm]?[jt]sx?$" },
    },
    { name: "no-unresolved", severity: "error", from: {}, to: { couldNotResolve: true } },
    { name: "no-cycles", severity: "error", from: {}, to: { circular: true } },
    {
      name: "source-does-not-import-build-output",
      severity: "error",
      from: {},
      to: { path: "^(apps|packages)/[^/]+/(dist|\\.next)/" },
    },
    {
      name: "context-domain-does-not-import-outer-layers",
      severity: "error",
      from: { path: "^packages/([^/]+)/src/domain(?:\\.ts|/)" },
      to: {
        path: "^packages/$1/src/(application|adapters|agents|testing|database|migration)(?:\\.ts|/)",
      },
    },
    {
      name: "context-contracts-do-not-import-implementation",
      severity: "error",
      from: { path: "^packages/([^/]+)/src/contracts(?:\\.ts|/)" },
      to: {
        path: "^packages/$1/src/(application|adapters|agents|testing|database|migration)(?:\\.ts|/)",
      },
    },
    {
      name: "context-application-does-not-import-foreign-application",
      severity: "error",
      from: { path: "^packages/([^/]+)/src/application(?:\\.ts|/)" },
      to: {
        path: "^packages/[^/]+/src/application(?:\\.ts|/)",
        pathNot: "^packages/$1/src/application(?:\\.ts|/)",
      },
    },
    {
      name: "context-application-does-not-import-adapters",
      severity: "error",
      from: { path: "^packages/([^/]+)/src/application(?:\\.ts|/)" },
      to: {
        path: "^packages/$1/src/(adapters|agents|testing|database|migration)(?:\\.ts|/)",
      },
    },
    {
      name: "packages-do-not-import-apps",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "apps-are-independent",
      severity: "error",
      from: { path: "^apps/([^/]+)/" },
      to: { path: "^apps/", pathNot: "^apps/$1/" },
    },
  ],
  options: {
    doNotFollow: { path: "(^|/)(node_modules|dist|\\.next)/" },
    exclude: "^(apps|packages)/[^/]+/(test|tests)/",
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { conditionNames: ["import", "node", "default"] },
  },
};
