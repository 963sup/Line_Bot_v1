import assert from "node:assert/strict";
import test from "node:test";
import {
  extractSchemaRelations,
  validateDataTopology,
  validateReservedSchema,
} from "./data-topology-core.mjs";

function fixture() {
  const model = {
    semanticOwners: [
      { id: "repository", lifecycle: "current" },
      { id: "workforce", lifecycle: "selected-target" },
    ],
    concepts: [{ id: "repository", owner: "repository", persistenceExpectation: "relation" }],
  };
  const dataTopology = {
    version: 2,
    role: "relation-data-topology",
    files: [{ path: "supabase/schemas/600_repositories.sql", role: "authoritative" }],
    relations: [
      {
        name: "repositories",
        kind: "table",
        path: "supabase/schemas/600_repositories.sql",
        authority: true,
        semanticOwner: "repository",
        concept: "repository",
      },
    ],
  };
  const schemaFiles = ["supabase/schemas/600_repositories.sql"];
  const relationsByFile = new Map([[schemaFiles[0], [{ name: "repositories", kind: "table" }]]]);
  return { model, dataTopology, schemaFiles, relationsByFile };
}

test("reserved schema names allow comments but reject executable SQL until activated", () => {
  const file = {
    path: "supabase/schemas/870_employments.sql",
    role: "reserved",
    targetOwner: "workforce",
  };
  const comments = "-- status: reserved\n-- owner: workforce\n-- Employment target only.\n";
  assert.deepEqual(validateReservedSchema(file, comments), []);
  for (const sql of [
    "create table app_private.employments(id text);",
    "select 1;",
    "grant usage on schema app_private to line_app;",
    "/* block comment */",
  ])
    assert.match(validateReservedSchema(file, comments + sql).join("\n"), /only line comments/);
  assert.match(validateReservedSchema(file, "-- owner: workforce\n").join("\n"), /status marker/);
  assert.match(
    validateReservedSchema(file, comments.replace("workforce", "audit")).join("\n"),
    /owner marker/,
  );
  assert.match(
    validateReservedSchema({ ...file, role: "authoritative" }, comments).join("\n"),
    /requires reserved file role/,
  );
  assert.deepEqual(
    validateReservedSchema(
      { ...file, role: "authoritative" },
      "create table app_private.employments(id text);",
    ),
    [],
  );
  assert.deepEqual(validateReservedSchema(file, comments), []);
});

test("reserved files register a target owner without claiming current persistence", () => {
  const f = fixture();
  const file = {
    path: "supabase/schemas/870_employments.sql",
    role: "reserved",
    targetOwner: "workforce",
  };
  f.dataTopology.files.push(file);
  f.schemaFiles.push(file.path);
  f.relationsByFile.set(file.path, []);
  assert.deepEqual(
    validateDataTopology(f.model, f.dataTopology, f.schemaFiles, f.relationsByFile),
    [],
  );
  file.targetOwner = "unknown";
  assert.match(
    validateDataTopology(f.model, f.dataTopology, f.schemaFiles, f.relationsByFile).join("\n"),
    /known targetOwner/,
  );
  file.targetOwner = "workforce";
  f.dataTopology.relations.push({
    name: "employments",
    path: file.path,
    kind: "table",
    authority: false,
  });
  assert.match(
    validateDataTopology(f.model, f.dataTopology, f.schemaFiles, f.relationsByFile).join("\n"),
    /cannot map current relations/,
  );
  f.dataTopology.relations.pop();
  assert.deepEqual(
    validateDataTopology(f.model, f.dataTopology, f.schemaFiles, f.relationsByFile),
    [],
  );
});

test("extracts app_private tables and views from declarative SQL", () => {
  assert.deepEqual(
    extractSchemaRelations(
      "create table app_private.repositories(id text); create view app_private.repository_access_view as select 1;",
    ),
    [
      { kind: "table", name: "repositories" },
      { kind: "view", name: "repository_access_view" },
    ],
  );
});
test("accepts exact relation-level authority", () => {
  const f = fixture();
  assert.deepEqual(
    validateDataTopology(f.model, f.dataTopology, f.schemaFiles, f.relationsByFile),
    [],
  );
});
test("rejects persisted relation without authority mapping", () => {
  const f = fixture();
  f.relationsByFile.get(f.schemaFiles[0]).push({ name: "labels", kind: "table" });
  assert.match(
    validateDataTopology(f.model, f.dataTopology, f.schemaFiles, f.relationsByFile).join("\n"),
    /unmapped persisted relation labels/,
  );
});
test("rejects mixed semantic owners in one authoritative file", () => {
  const f = fixture();
  f.model.semanticOwners.push({ id: "organization", lifecycle: "current" });
  f.dataTopology.relations.push({
    name: "organizations",
    kind: "table",
    path: f.schemaFiles[0],
    authority: true,
    semanticOwner: "organization",
  });
  f.relationsByFile.get(f.schemaFiles[0]).push({ name: "organizations", kind: "table" });
  assert.match(
    validateDataTopology(f.model, f.dataTopology, f.schemaFiles, f.relationsByFile).join("\n"),
    /mixes semantic owners/,
  );
});
test("rejects required semantic persistence with no relation", () => {
  const f = fixture();
  f.dataTopology.relations[0].concept = undefined;
  assert.match(
    validateDataTopology(f.model, f.dataTopology, f.schemaFiles, f.relationsByFile).join("\n"),
    /concept requiring relation persistence/,
  );
});
test("rejects selected-target persistence", () => {
  const f = fixture();
  f.dataTopology.relations[0].semanticOwner = "workforce";
  assert.match(
    validateDataTopology(f.model, f.dataTopology, f.schemaFiles, f.relationsByFile).join("\n"),
    /selected-target owner/,
  );
});
