import assert from "node:assert/strict";
import test from "node:test";
import {
  extractSchemaRelations,
  hasExecutableSchemaContent,
  validateDataTopology,
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

test("future schema placeholders are rejected by the current-state topology", () => {
  const f = fixture();
  const path = "supabase/schemas/870_employments.sql";
  f.dataTopology.files.push({ path, role: "reserved", targetOwner: "workforce" });
  f.schemaFiles.push(path);
  f.relationsByFile.set(path, []);
  assert.match(
    validateDataTopology(f.model, f.dataTopology, f.schemaFiles, f.relationsByFile).join("\n"),
    /unsupported current schema file role reserved/,
  );
});

test("current schema files must contain executable SQL", () => {
  assert.equal(
    hasExecutableSchemaContent("-- future target only\n-- no current database object\n"),
    false,
  );
  assert.equal(
    hasExecutableSchemaContent(
      "/* explanation */\n-- comment\ncreate table app_private.example(id text);",
    ),
    true,
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
