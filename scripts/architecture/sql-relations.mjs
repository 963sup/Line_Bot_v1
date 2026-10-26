import { loadModule, parseSync } from "libpg-query";

// The pinned PostgreSQL 17 grammar matches the repository's PostgreSQL CI service.
await loadModule();

const statements = new Set([
  "SelectStmt",
  "InsertStmt",
  "UpdateStmt",
  "DeleteStmt",
  "MergeStmt",
  "TruncateStmt",
  "CopyStmt",
  "LockStmt",
  "TransactionStmt",
  "VariableSetStmt",
  "ExplainStmt",
]);
const mutations = new Set(["InsertStmt", "UpdateStmt", "DeleteStmt", "MergeStmt"]);

/** Resolve physical relation references, preserving lexical CTE scope and DML targets. */
export function extractSqlRelations(sql) {
  const parsed = parseSync(sql);
  const accesses = [];
  const add = (relation, operation, ctes) => {
    if (!relation?.relname) throw new Error("SQL relation has no static name");
    if (operation === "read" && !relation.schemaname && ctes.has(relation.relname)) return;
    accesses.push({
      schema: relation.schemaname ?? null,
      name: relation.relname,
      operation,
    });
  };

  function visitStatement(kind, statement, inherited) {
    if (!statements.has(kind)) throw new Error(`Unsupported runtime SQL statement: ${kind}`);
    const ctes = new Set(inherited);
    const definitions = statement.withClause?.ctes ?? [];
    if (statement.withClause?.recursive) {
      for (const entry of definitions) ctes.add(entry.CommonTableExpr.ctename);
    }
    for (const entry of definitions) {
      const definition = entry.CommonTableExpr;
      visit(definition.ctequery, ctes);
      ctes.add(definition.ctename);
    }

    // FOR UPDATE OF names are aliases of the already-visited FROM relations.
    const handled = new Set(["withClause", "lockingClause"]);
    if (mutations.has(kind) || kind === "CopyStmt") {
      if (statement.relation) {
        add(statement.relation, kind === "CopyStmt" && !statement.is_from ? "read" : "write", ctes);
        handled.add("relation");
      }
    }
    if (kind === "TruncateStmt" || kind === "LockStmt") {
      for (const relation of statement.relations ?? []) {
        add(relation.RangeVar, kind === "TruncateStmt" ? "write" : "read", ctes);
      }
      handled.add("relations");
    }
    // SELECT INTO creates a physical relation even when a CTE has the same name.
    if (statement.intoClause) {
      add(statement.intoClause.rel, "write", ctes);
      handled.add("intoClause");
    }
    for (const [key, value] of Object.entries(statement)) {
      if (!handled.has(key)) visit(value, ctes);
    }
  }

  function visit(node, ctes) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, ctes);
      return;
    }
    if (node.RangeVar) {
      add(node.RangeVar, "read", ctes);
      return;
    }
    for (const [kind, value] of Object.entries(node)) {
      if (kind.endsWith("Stmt")) visitStatement(kind, value, ctes);
      else visit(value, ctes);
    }
  }

  for (const entry of parsed.stmts) visit(entry.stmt, new Set());
  return accesses;
}
