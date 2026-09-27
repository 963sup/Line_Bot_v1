import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

export function validateReservedSchema(file, sql) {
  if (file.role !== "reserved") {
    return /^-- status: reserved\s*$/m.test(sql)
      ? [`Data topology ${file.path}: reserved marker requires reserved file role`]
      : [];
  }
  const errors = [];
  if (!sql.split(/\r?\n/).every((line) => !line.trim() || line.trimStart().startsWith("--")))
    errors.push(`Data topology ${file.path}: reserved schema must contain only line comments`);
  if (!/^-- status: reserved\s*$/m.test(sql))
    errors.push(`Data topology ${file.path}: reserved status marker is required`);
  if (!sql.split(/\r?\n/).includes(`-- owner: ${file.targetOwner}`))
    errors.push(`Data topology ${file.path}: reserved owner marker must match targetOwner`);
  return errors;
}

export function extractSchemaRelations(sql) {
  return [
    ...sql.matchAll(
      /create\s+(?:or\s+replace\s+)?(table|view)\s+(?:if\s+not\s+exists\s+)?app_private\.["]?([a-zA-Z0-9_]+)["]?/gi,
    ),
  ].map((match) => ({ kind: match[1].toLowerCase(), name: match[2] }));
}

export function validateDataTopology(
  model,
  dataTopology,
  schemaFiles,
  relationsByFile = new Map(),
) {
  const errors = [];
  if (dataTopology?.version !== 2 || dataTopology?.role !== "relation-data-topology")
    errors.push("Data topology: expected version 2 relation-data-topology");
  const owners = new Map((model?.semanticOwners ?? []).map((owner) => [owner.id, owner]));
  const concepts = new Map((model?.concepts ?? []).map((concept) => [concept.id, concept]));
  const files = new Map();
  for (const file of dataTopology?.files ?? []) {
    if (!file?.path) continue;
    if (files.has(file.path)) errors.push("Data topology: duplicate file " + file.path);
    files.set(file.path, file);
    if (file.role === "reserved" && !owners.has(file.targetOwner))
      errors.push("Data topology " + file.path + ": reserved file requires known targetOwner");
    if (file.mechanismOwner && !owners.has(file.mechanismOwner))
      errors.push("Data topology " + file.path + ": unknown mechanismOwner " + file.mechanismOwner);
  }
  const actualFiles = new Set(schemaFiles);
  for (const path of actualFiles)
    if (!files.has(path)) errors.push("Data topology: undeclared schema file " + path);
  for (const path of files.keys())
    if (!actualFiles.has(path))
      errors.push("Data topology: declared schema file does not exist " + path);

  const relations = new Map();
  const conceptRelations = new Map();
  for (const relation of dataTopology?.relations ?? []) {
    if (!relation?.name) {
      errors.push("Data topology relation: name is required");
      continue;
    }
    if (relations.has(relation.name)) {
      errors.push("Data topology: duplicate relation " + relation.name);
      continue;
    }
    relations.set(relation.name, relation);
    if (files.get(relation.path)?.role === "reserved")
      errors.push(
        "Data topology " + relation.name + ": reserved file cannot map current relations",
      );
    if (!files.has(relation.path))
      errors.push("Data topology " + relation.name + ": unknown file " + relation.path);
    if (relation.authority === true) {
      if (!relation.semanticOwner || !owners.has(relation.semanticOwner))
        errors.push(
          "Data topology " + relation.name + ": authoritative relation requires semanticOwner",
        );
      if (owners.get(relation.semanticOwner)?.lifecycle === "selected-target")
        errors.push(
          "Data topology " +
            relation.name +
            ": selected-target owner cannot own current persistence",
        );
    } else if (relation.authority === false) {
      if (relation.semanticOwner)
        errors.push(
          "Data topology " + relation.name + ": derived relation cannot claim semanticOwner",
        );
    } else errors.push("Data topology " + relation.name + ": authority must be boolean");
    if (relation.concept) {
      const concept = concepts.get(relation.concept);
      if (!concept)
        errors.push("Data topology " + relation.name + ": unknown concept " + relation.concept);
      else if (relation.semanticOwner !== concept.owner)
        errors.push(
          "Data topology " +
            relation.name +
            ": semanticOwner disagrees with concept " +
            relation.concept,
        );
      if (!conceptRelations.has(relation.concept)) conceptRelations.set(relation.concept, []);
      conceptRelations.get(relation.concept).push(relation.name);
    }
  }

  for (const [path, actual] of relationsByFile) {
    for (const relation of actual) {
      const mapped = relations.get(relation.name);
      if (!mapped)
        errors.push("Data topology: unmapped persisted relation " + relation.name + " in " + path);
      else {
        if (mapped.path !== path)
          errors.push(
            "Data topology " +
              relation.name +
              ": mapped to " +
              mapped.path +
              " but declared in " +
              path,
          );
        if (mapped.kind !== relation.kind)
          errors.push("Data topology " + relation.name + ": kind mismatch");
      }
    }
  }
  for (const relation of relations.values()) {
    const actual = relationsByFile.get(relation.path) ?? [];
    if (!actual.some((entry) => entry.name === relation.name))
      errors.push(
        "Data topology: mapped relation does not exist " + relation.name + " in " + relation.path,
      );
  }

  for (const concept of concepts.values()) {
    if (
      concept.persistenceExpectation === "relation" &&
      !(conceptRelations.get(concept.id) ?? []).length
    )
      errors.push(
        "Data topology: concept requiring relation persistence is unmapped " + concept.id,
      );
  }

  for (const [path, file] of files) {
    if (file.role === "authoritative") {
      const ownerSet = new Set(
        [...relations.values()]
          .filter((r) => r.path === path && r.authority)
          .map((r) => r.semanticOwner),
      );
      if (ownerSet.size > 1)
        errors.push("Data topology " + path + ": authoritative file mixes semantic owners");
    }
  }
  return errors;
}

export function compileDataTopology(model, dataTopology, schemaFiles, relationsByFile = new Map()) {
  const errors = validateDataTopology(model, dataTopology, schemaFiles, relationsByFile);
  const surfaces = new Map(
    (dataTopology?.relations ?? []).map((relation) => [relation.name, relation]),
  );
  const byOwner = new Map((model?.semanticOwners ?? []).map((owner) => [owner.id, []]));

  for (const relation of surfaces.values()) {
    if (relation.semanticOwner && byOwner.has(relation.semanticOwner)) {
      byOwner.get(relation.semanticOwner).push({
        path: relation.path,
        relation: relation.name,
        role: "owner",
        authority: relation.authority,
      });
    }
    for (const participant of relation.participants ?? []) {
      if (!byOwner.has(participant)) continue;
      byOwner.get(participant).push({
        path: relation.path,
        relation: relation.name,
        role: "participant",
        authority: relation.authority,
      });
    }
  }

  for (const entries of byOwner.values()) {
    entries.sort(
      (a, b) =>
        a.path.localeCompare(b.path) ||
        a.relation.localeCompare(b.relation) ||
        a.role.localeCompare(b.role),
    );
  }

  return { errors, dataTopology, surfaces, byOwner, schemaFiles, relationsByFile };
}

export async function loadDataTopologySources(root = repositoryRoot) {
  const [dataTopology, names] = await Promise.all([
    readFile(resolve(root, "architecture/data-topology.json"), "utf8").then(JSON.parse),
    readdir(resolve(root, "supabase/schemas")),
  ]);
  const schemaFiles = names
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => "supabase/schemas/" + name);
  const relationsByFile = new Map();
  for (const path of schemaFiles) {
    const sql = await readFile(resolve(root, path), "utf8");
    const file = dataTopology.files.find((entry) => entry.path === path);
    const errors = validateReservedSchema(file ?? { path }, sql);
    if (errors.length) throw new Error(errors.join("\n"));
    relationsByFile.set(path, extractSchemaRelations(sql));
  }
  return { dataTopology, schemaFiles, relationsByFile };
}
