import { extractRuntimeSql } from "./runtime-sql-source.mjs";
import { extractSqlRelations } from "./sql-relations.mjs";

const normalize = (path) => path.replaceAll("\\", "/");

export function validateRuntimeDataAccess(model, topology, data, sources, options = {}) {
  const workspaces = Object.entries({ ...topology?.modules, ...topology?.applications })
    .map(([name, entry]) => ({ name, ...entry, path: normalize(entry.path) }))
    .sort((left, right) => right.path.length - left.path.length);
  const workspaceFor = (path) => workspaces.find((entry) => path.startsWith(`${entry.path}/src/`));
  const owners = new Set((model?.semanticOwners ?? []).map((entry) => entry.id));
  const schema = data?.databaseSchema ?? "app_private";
  const relations = new Map((data?.relations ?? []).map((entry) => [entry.name, entry]));
  const analysisErrors = [];
  const violations = new Set();
  const runtimeSources = {};
  for (const [rawPath, source] of Object.entries(sources)) {
    const path = normalize(rawPath);
    if (!workspaceFor(path)) {
      analysisErrors.push(`Data access analysis: ${path} has no canonical runtime workspace`);
      continue;
    }
    if (Object.hasOwn(runtimeSources, path)) {
      analysisErrors.push(`Data access analysis: duplicate normalized source path ${path}`);
      continue;
    }
    runtimeSources[path] = source;
  }
  for (const relation of relations.values()) {
    if (relation.authority && !owners.has(relation.semanticOwner)) {
      analysisErrors.push(
        `Data access configuration: ${relation.name} has unknown semantic owner ${relation.semanticOwner}`,
      );
    }
  }
  const extracted = extractRuntimeSql(runtimeSources, {
    sqlTransportContracts: options.sqlTransportContracts ?? [],
    publicEntryPoints: options.publicEntryPoints,
    isForwardedQuery: ({ path, argumentIsParameter, sqlTransportFactory: factory }) => {
      const workspace = workspaceFor(path);
      return Boolean(
        argumentIsParameter &&
          factory?.name === "createSql" &&
          factory.exported &&
          factory.returnsSql &&
          factory.publicContract &&
          workspace?.semanticOwner === "platform" &&
          workspace.moduleKind === "support-module" &&
          workspaceFor(factory.path) === workspace,
      );
    },
  });
  analysisErrors.push(...extracted.errors.map((error) => `Data access analysis: ${error}`));
  for (const query of extracted.queries) {
    const workspace = workspaceFor(query.path);
    let accesses;
    try {
      accesses = extractSqlRelations(query.sql);
    } catch (error) {
      analysisErrors.push(
        `Data access analysis: ${query.path}:${query.line} cannot parse runtime SQL: ${error.message}`,
      );
      continue;
    }
    for (const access of accesses) {
      // Provider/catalog schemas are outside this app-owned relation topology.
      if (access.schema !== null && access.schema !== schema) continue;
      const relation = relations.get(access.name);
      if (!relation) {
        analysisErrors.push(
          `Data access analysis: ${query.path}:${query.line} references undeclared relation ${access.name}`,
        );
        continue;
      }
      if (relation.authority) {
        if (workspace.semanticOwner !== relation.semanticOwner) {
          violations.add(
            `Data boundary: ${query.path}:${query.line} (${workspace.semanticOwner ?? workspace.moduleKind}) directly ${access.operation === "write" ? "mutates" : "reads"} ${relation.name} owned by ${relation.semanticOwner}`,
          );
        }
      } else if (
        access.operation === "write" ||
        !["derived-projection", "constrained-projection"].includes(relation.role) ||
        !(relation.participants ?? []).includes(workspace.semanticOwner)
      ) {
        violations.add(
          `Data boundary: ${query.path}:${query.line} (${workspace.semanticOwner ?? workspace.moduleKind}) uses ${relation.name} without declared read-only projection participation`,
        );
      }
    }
  }
  return {
    errors: [...violations, ...analysisErrors],
    sourceCount: Object.keys(runtimeSources).length,
    queryCount: extracted.queries.length,
    forwardedCount: extracted.forwarded.length,
    violationCount: violations.size,
    analysisFailureCount: analysisErrors.length,
  };
}
