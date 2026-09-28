function escapeRegExp(value) {
  return value.replace(/[.*+?^$()|[\]{}\\]/g, "\\$&");
}

function isRuntimePostgresAdapter(path, modulePath) {
  if (!path.startsWith(modulePath + "/src/")) return false;
  const relative = path.slice((modulePath + "/src/").length);
  return relative === "adapters/postgres.ts" || relative.startsWith("adapters/postgres/");
}

function relationPattern(relation, operations) {
  return new RegExp(
    "\\b(?:" +
      operations +
      ')\\s+(?:app_private\\.)?[\\"]?' +
      escapeRegExp(relation.name) +
      '[\\"]?\\b',
    "i",
  );
}

export function validateRuntimeDataAccess(
  semanticModel,
  implementationTopology,
  dataTopology,
  sources,
) {
  const errors = [];
  const ownerModules = new Map(
    Object.entries(implementationTopology?.modules ?? {}).map(([name, module]) => [
      module.semanticOwner,
      { name, ...module },
    ]),
  );
  const relations = dataTopology?.relations ?? [];

  for (const [path, source] of Object.entries(sources)) {
    const module = [...ownerModules.values()].find((candidate) =>
      isRuntimePostgresAdapter(path, candidate.path),
    );
    if (!module) continue;

    for (const relation of relations) {
      const writes = relationPattern(
        relation,
        "insert\\s+into|update|delete\\s+from|truncate(?:\\s+table)?|merge\\s+into",
      ).test(source);
      const reads = relationPattern(relation, "from|join").test(source);
      if (!writes && !reads) continue;

      if (relation.authority === true) {
        if (module.semanticOwner !== relation.semanticOwner) {
          errors.push(
            "Data boundary: " +
              path +
              " (" +
              module.semanticOwner +
              ") directly " +
              (writes ? "mutates" : "reads") +
              " " +
              relation.name +
              " owned by " +
              relation.semanticOwner,
          );
        }
        continue;
      }

      const participants = relation.participants ?? [];
      if (
        writes ||
        relation.role !== "derived-projection" ||
        !participants.includes(module.semanticOwner)
      ) {
        errors.push(
          "Data boundary: " +
            path +
            " (" +
            module.semanticOwner +
            ") uses " +
            relation.name +
            " without declared derived-projection participation",
        );
      }
    }
  }

  for (const relation of relations.filter((entry) => entry.authority === true)) {
    const owner = ownerModules.get(relation.semanticOwner);
    if (!owner) continue;
    if (!semanticModel?.semanticOwners?.some((entry) => entry.id === relation.semanticOwner)) {
      errors.push(
        "Data boundary: relation " +
          relation.name +
          " references unknown semantic owner " +
          relation.semanticOwner,
      );
    }
  }

  return errors;
}
