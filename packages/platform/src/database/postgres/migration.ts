import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { Sql } from "./database.js";

type Row = Record<string, unknown>;
export type MigrationPlan = {
  tables: Record<string, Row[]>;
  counts: Record<string, number>;
  fingerprint: string;
};
/** Read-only legacy adapter. Business IDs are retained; old raw LINE expense owners are resolved uniquely. */
export function planLegacyImport(
  memberPath: string,
  expensePath: string,
  provider: string,
): MigrationPlan {
  const members = new DatabaseSync(memberPath, { readOnly: true }),
    expenses = new DatabaseSync(expensePath, { readOnly: true });
  try {
    const exists = (db: DatabaseSync, name: string) =>
      !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
    const rows = (db: DatabaseSync, name: string): Row[] =>
      exists(db, name)
        ? db
            .prepare(`SELECT * FROM ${name}`)
            .all()
            .map((row) => {
              const r: Row = { ...row };
              if ("member_id" in r) {
                r.uid = r.member_id;
                delete r.member_id;
              }
              return r;
            })
        : [];
    if (
      rows(members, "member_google_operations").length ||
      rows(members, "member_link_flows").some((r) => Number(r.expires) > Date.now())
    )
      throw new Error("Finish pending identity operations and stop writers before import.");

    const legacyCoinRows = rows(members, "member_coin_ledger");
    const identityRows = (name: string) =>
      rows(members, name).map((row) => {
        const { uid, ...legacy } = row;
        return { ...legacy, user_id: uid };
      });
    const tables: Record<string, Row[]> = {
      users: rows(members, "members").map((row) => ({
        ...row,
        status: row.status === "pending" ? "paused" : row.status,
        ...(row.suspended_from === "pending" ? { suspended_from: "paused" } : {}),
      })),
      user_identities: identityRows("member_identities"),
      user_events: identityRows("member_events"),
      asset_ledger_entries: [],
      member_attendance: rows(members, "member_attendance"),
      expenses: rows(expenses, "expenses"),
      expense_events: rows(expenses, "expense_events"),
      receipt_intents: [],
    };
    const ids = new Set(tables.users!.map((account) => String(account.id)));
    for (const account of tables.users!) {
      const identities = tables.user_identities!.filter(
          (identity) => identity.user_id === account.id,
        ),
        line = identities.filter((i) => i.provider === provider);
      if (
        line.length !== 1 ||
        identities.some((i) => i.provider !== provider && i.provider !== "google") ||
        !["paused", "active", "suspended"].includes(String(account.status))
      )
        throw new Error("Invalid member mapping.");
      if (account.status === "active" && !identities.some((i) => i.provider === "google"))
        throw new Error("Active member lacks Google identity.");
      account.auth_user_id = null;
    }
    for (const name of ["user_identities", "user_events"])
      for (const row of tables[name]!)
        if (!ids.has(String(row.user_id))) throw new Error("Orphaned member record.");
    for (const row of tables.member_attendance!)
      if (!ids.has(String(row.uid))) throw new Error("Orphaned member record.");

    for (const row of legacyCoinRows) {
      const memberId = String(row.uid);
      if (!ids.has(memberId)) throw new Error("Orphaned member record.");
      const day = String(row.day);
      const at = Number(row.at);
      const reason = "reason" in row ? String(row.reason) : "legacy_balance";
      const sourceContext =
        reason === "daily_checkin"
          ? "membership"
          : reason === "clockIn" || reason === "clockOut"
            ? "attendance"
            : reason === "legacy_balance"
              ? "migration"
              : null;
      if (!sourceContext) throw new Error("Invalid Coin reason.");
      const amountUnits =
        reason === "legacy_balance" && !("reason" in row)
          ? Number(row.amount) * 2
          : Number(row.amount);
      if (
        !Number.isSafeInteger(amountUnits) ||
        amountUnits <= 0 ||
        !Number.isSafeInteger(at) ||
        at < 0
      )
        throw new Error("Invalid Coin amount.");
      tables.asset_ledger_entries!.push({
        member_id: memberId,
        asset_code: "coin",
        source_context: sourceContext,
        source_type: reason,
        source_ref: day,
        business_day: day,
        amount_units: amountUnits,
        at,
      });
    }

    for (const row of tables.expenses!) {
      const body = JSON.parse(String(row.body));
      if (
        row.id !== body.id ||
        row.owner !== body.owner ||
        row.scope !== body.scope ||
        row.image_id !== body.imageId ||
        Number(row.number) !== body.number
      )
        throw new Error("Expense body mismatch.");
      const candidates = tables.user_identities!.filter(
        (i) => i.provider === provider && i.subject === row.owner,
      );
      const owner = ids.has(String(row.owner))
        ? String(row.owner)
        : candidates.length === 1
          ? String(candidates[0]!.user_id)
          : null;
      if (!owner) throw new Error("Expense owner cannot be resolved uniquely.");
      row.owner = owner;
      row.body = { ...body, owner };
    }
    const expenseIds = new Set(tables.expenses!.map((e) => e.id));
    if (tables.expense_events!.some((e) => !expenseIds.has(e.expense_id)))
      throw new Error("Orphaned expense event.");
    const counts = Object.fromEntries(
      Object.entries(tables).map(([name, tableRows]) => [name, tableRows.length]),
    );
    return {
      tables,
      counts,
      fingerprint: createHash("sha256").update(JSON.stringify(tables)).digest("hex"),
    };
  } finally {
    members.close();
    expenses.close();
  }
}

/** Caller must provide the privileged Sql handle of one explicit migration transaction. */
export async function importLegacyPlanInTransaction(sql: Sql, plan: MigrationPlan) {
  const allowed = [
    "users",
    "user_identities",
    "user_events",
    "asset_ledger_entries",
    "member_attendance",
    "expenses",
    "expense_events",
    "receipt_intents",
  ];
  const tableRef = (name: string) => `app_private."${name}"`;
  for (const name of allowed) {
    if ((await sql.query(`SELECT 1 FROM ${tableRef(name)} LIMIT 1`)).rows.length)
      throw new Error("Initial import requires an empty target; nothing overwritten.");
  }
  for (const name of allowed)
    for (const row of plan.tables[name] ?? []) {
      const keys = Object.keys(row);
      if (keys.some((k) => !/^\w+$/.test(k))) throw new Error("Invalid column.");
      await sql.query(
        `INSERT INTO ${tableRef(name)}(${keys.map((k) => `"${k}"`).join(",")}) VALUES(${keys.map((_, i) => "$" + (i + 1)).join(",")})`,
        keys.map((k) => (k === "body" ? JSON.stringify(row[k]) : row[k])),
      );
    }
  for (const [table, column] of [
    ["expenses", "number"],
    ["user_events", "id"],
    ["expense_events", "id"],
  ] as const) {
    await sql.query(
      `SELECT setval(pg_get_serial_sequence('app_private.${table}','${column}'),GREATEST(COALESCE(MAX(${column}),0),1),COUNT(*)>0) FROM ${tableRef(table)}`,
    );
  }
  for (const name of allowed) {
    const n = Number((await sql.query(`SELECT COUNT(*) n FROM ${tableRef(name)}`)).rows[0]!.n);
    if (n !== (plan.counts[name] ?? 0)) throw new Error("Import row count mismatch.");
  }
}
