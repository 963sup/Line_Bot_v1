// Canonical dependency contract: docs/rules/dependency-boundaries.md.
import { fileURLToPath } from "node:url";
import { readModuleContracts } from "./scripts/tooling/repository-contracts.mjs";

const workspaces = new Map(
  [...readModuleContracts(fileURLToPath(new URL("./", import.meta.url)))].filter(
    ([, module]) => module.status !== "target",
  ),
);

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
      name: "contract-and-wbs-do-not-compose-content-internally",
      severity: "error",
      comment: "Contract and WBS read Content through narrow ports wired in the application host",
      from: { path: "^packages/(contract|wbs)/src/" },
      to: { path: "^packages/content/src/composition/bootstrap/" },
    },
    {
      name: "content-bootstrap-does-not-compose-resources-bootstrap",
      severity: "error",
      comment: "Content source resource references are provided by the Host",
      from: { path: "^packages/content/src/composition/bootstrap/" },
      to: { path: "^packages/resources/src/composition/bootstrap/" },
    },
    {
      name: "contract-bootstrap-does-not-compose-file-bootstrap",
      severity: "error",
      comment: "Contract File revision qualification is injected by the application host",
      from: { path: "^packages/contract/src/composition/bootstrap/" },
      to: { path: "^packages/file/src/composition/bootstrap/" },
    },
    {
      name: "intelligence-bootstrap-does-not-compose-file-bootstrap",
      severity: "error",
      comment: "Host provides the exact File revision reader and qualifier to Intelligence",
      from: { path: "^packages/intelligence/src/composition/bootstrap/" },
      to: { path: "^packages/file/src/composition/bootstrap/" },
    },
    {
      name: "discussion-read-does-not-compose-repository-postgres",
      severity: "error",
      comment: "Discussion read access is injected by the application host",
      from: { path: "^packages/discussion/src/adapters/postgres\\.ts$" },
      to: { path: "^packages/repository/src/postgres/" },
    },
    {
      name: "features-do-not-import-routes",
      severity: "error",
      from: { path: "^apps/[^/]+/src/(modules|features|components|shared)/" },
      to: { path: "^apps/[^/]+/src/app/" },
    },
    {
      name: "web-features-do-not-import-concrete-package-implementations",
      severity: "error",
      comment:
        "Web modules and shared mechanisms may consume package contracts, but concrete implementations are wired by the host composition root",
      from: { path: "^apps/web/src/(modules|shared)/" },
      to: {
        path: "^packages/[^/]+/src/(postgres|adapters|composition|agents|database|migration|supabase-identity|gemini)(?:\\.ts|/)",
      },
    },
    {
      name: "web-delivery-does-not-import-concrete-package-implementations",
      severity: "error",
      comment:
        "Next route/page delivery stays an inbound adapter; only app _composition may wire concrete package implementations",
      from: { path: "^apps/web/src/app/(?!.*_composition/)" },
      to: {
        path: "^packages/[^/]+/src/(postgres|adapters|composition|agents|database|migration|supabase-identity|gemini)(?:\\.ts|/)",
      },
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
      comment:
        "Domain layer must be pure and never depend on contracts, application, adapters, or infrastructure",
      from: { path: "^packages/([^/]+)/src/domain(?:\\.ts|/)" },
      to: {
        path: "^packages/$1/src/(contracts|application|adapters|composition|postgres|agents|testing|database|migration)(?:\\.ts|/)",
      },
    },
    {
      name: "context-domain-does-not-import-runtime",
      severity: "error",
      from: { path: "^packages/[^/]+/src/domain(?:\\.ts|/)" },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "context-domain-does-not-import-external-packages",
      severity: "error",
      from: { path: "^packages/[^/]+/src/domain(?:\\.ts|/)" },
      to: { path: "(^|/)node_modules/" },
    },
    {
      name: "context-contracts-do-not-import-implementation",
      severity: "error",
      comment:
        "Contracts layer (Ports & DTOs) may depend on domain, but must not depend on application or adapters",
      from: { path: "^packages/([^/]+)/src/contracts(?:\\.ts|/)" },
      to: {
        path: "^packages/$1/src/(application|adapters|composition|postgres|agents|testing|database|migration)(?:\\.ts|/)",
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
      comment:
        "Application use cases must interact via contracts/ports and never depend directly on concrete adapters",
      from: { path: "^packages/([^/]+)/src/application(?:\\.ts|/)" },
      to: {
        path: "^packages/$1/src/(adapters|composition|postgres|agents|testing|database|migration)(?:\\.ts|/)",
      },
    },
    {
      name: "application-ports-are-not-canonical",
      severity: "error",
      comment:
        "Ports belong to the explicit contracts/input, contracts/output or contracts/repositories boundary",
      from: { path: "^(apps|packages)/[^/]+/src/" },
      to: { path: "^packages/[^/]+/src/application/ports(?:\\.ts|/)" },
    },
    {
      name: "context-inner-layers-do-not-import-adapters",
      severity: "error",
      comment: "Domain, contracts, and application layers must never depend on concrete adapters",
      from: { path: "^packages/[^/]+/src/(domain|contracts|application)(?:\\.ts|/)" },
      to: {
        path: "^packages/[^/]+/src/(adapters|composition|postgres|agents|testing|database|migration)(?:\\.ts|/)",
      },
    },
    {
      name: "no-relative-imports-across-packages",
      severity: "error",
      comment:
        "Packages must not import internal files of other packages via relative paths; use public workspace specifiers",
      from: { path: "^packages/([^/]+)/src/" },
      to: {
        path: "^packages/[^/]+/src/",
        pathNot: "^packages/$1/src/",
      },
    },
    {
      name: "adapters-are-private-implementations",
      severity: "error",
      comment:
        "Adapters are package-private implementations and must not be imported from outside the owning package",
      from: { path: "^packages/([^/]+)/" },
      to: {
        path: "^packages/[^/]+/src/adapters(?:\\.ts|/)",
        pathNot: "^packages/$1/",
      },
    },
    {
      name: "apps-do-not-import-package-adapters",
      severity: "error",
      comment:
        "Application hosts consume public package capabilities, never package-private adapters",
      from: { path: "^apps/" },
      to: { path: "^packages/[^/]+/src/adapters(?:\\.ts|/)" },
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
