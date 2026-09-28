import { readdirSync, readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const platformSchema = String.raw`(?:"?(?:auth|storage|supabase_migrations|public)"?)`;

function normalizedSql(sql) {
  return sql
    .replace(/--[^\n\r]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\s+/g, " ");
}

export function platformMutationViolations(sql) {
  const source = normalizedSql(sql);
  const rules = [
    [
      "platform DDL",
      new RegExp(
        String.raw`\b(?:create(?:\s+or\s+replace)?|alter|drop)\s+(?:table|schema|view|materialized\s+view|function|procedure|sequence|type)\s+(?:if\s+(?:not\s+)?exists\s+)?(?:only\s+)?${platformSchema}(?:\.|\b)`,
        "gi",
      ),
    ],
    [
      "platform trigger",
      new RegExp(
        String.raw`\bcreate\s+(?:constraint\s+)?trigger\b[^;]*?\bon\s+${platformSchema}\.`,
        "gi",
      ),
    ],
    [
      "platform policy",
      new RegExp(
        String.raw`\b(?:create|alter|drop)\s+policy\b[^;]*?\bon\s+${platformSchema}\.`,
        "gi",
      ),
    ],
    [
      "platform index",
      new RegExp(
        String.raw`\bcreate\s+(?:unique\s+)?index\b[^;]*?\bon\s+(?:only\s+)?${platformSchema}\.`,
        "gi",
      ),
    ],
    [
      "platform privilege",
      new RegExp(
        String.raw`\b(?:grant|revoke)\b[^;]*?\bon\s+(?:(?:table|sequence|function|procedure|schema|all\s+tables\s+in\s+schema|all\s+sequences\s+in\s+schema|all\s+functions\s+in\s+schema)\s+)?${platformSchema}(?:\.|\b)`,
        "gi",
      ),
    ],
    [
      "platform default privilege",
      new RegExp(
        String.raw`\balter\s+default\s+privileges\b[^;]*?\bin\s+schema\s+${platformSchema}\b`,
        "gi",
      ),
    ],
    [
      "platform insert",
      new RegExp(String.raw`\binsert\s+into\s+(?:only\s+)?${platformSchema}\.`, "gi"),
    ],
    ["platform update", new RegExp(String.raw`\bupdate\s+(?:only\s+)?${platformSchema}\.`, "gi")],
    [
      "platform delete",
      new RegExp(String.raw`\bdelete\s+from\s+(?:only\s+)?${platformSchema}\.`, "gi"),
    ],
    [
      "platform truncate",
      new RegExp(String.raw`\btruncate\s+(?:table\s+)?(?:only\s+)?${platformSchema}\.`, "gi"),
    ],
    [
      "platform comment",
      new RegExp(
        String.raw`\bcomment\s+on\s+(?:table|schema|view|materialized\s+view|function|procedure|sequence|type)\s+${platformSchema}(?:\.|\b)`,
        "gi",
      ),
    ],
    ["platform extension", /\b(?:create|alter|drop)\s+extension\b/gi],
    [
      "foreign role DDL",
      /\b(?:create|alter|drop)\s+role\s+(?!line_app\b|"line_app"\b)["A-Za-z_][A-Za-z0-9_$-]*/gi,
    ],
  ];

  const violations = [];
  for (const [kind, pattern] of rules) {
    for (const match of source.matchAll(pattern)) {
      violations.push({ kind, text: match[0].trim() });
    }
  }
  return violations;
}

export function assertSchemaOwnership(name, sql) {
  const violations = platformMutationViolations(sql);
  if (violations.length) {
    const detail = violations.map((item) => `${item.kind}: ${item.text}`).join("; ");
    throw new Error(
      `${name}: declarative application schemas may read/reference Supabase platform schemas but must not mutate them (${detail})`,
    );
  }
}

export function schemaFileNames() {
  const directory = new URL("supabase/schemas/", root);
  const names = readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (!names.length) throw new Error("No declarative schema files found.");
  return names;
}

export function declaredSchemaSql() {
  const directory = new URL("supabase/schemas/", root);
  return schemaFileNames()
    .map((name) => {
      const sql = readFileSync(new URL(name, directory), "utf8");
      assertSchemaOwnership(name, sql);
      return `-- source: ${name}\n${sql}`;
    })
    .join("\n");
}
