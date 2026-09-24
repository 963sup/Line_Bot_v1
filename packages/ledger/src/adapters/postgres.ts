import type { AccountId } from "@line-work/account/domain";
import type { AssetCode } from "@line-work/asset/domain";
import type { LedgerRepository } from "@line-work/ledger/application/ports/ledger-repository";
import type { LedgerCredit, LedgerSource } from "@line-work/ledger/domain";
import { businessDatabase, type Database, type Sql } from "@line-work/platform/adapters/postgres";

export async function recordLedgerCredit(sql: Sql, credit: LedgerCredit): Promise<number> {
  if (!Number.isFinite(credit.amount) || credit.amount <= 0)
    throw new Error("invalid_ledger_credit");
  const row = (
    await sql.query("SELECT post_asset_credit($1,$2,$3,$4,$5,$6,$7::numeric,$8) AS credited", [
      credit.holderAccountId,
      credit.asset,
      credit.source.context,
      credit.source.type,
      credit.sourceRef,
      credit.businessDay,
      credit.amount,
      credit.at,
    ])
  ).rows[0];
  return row?.credited ? credit.amount : 0;
}

export class PostgresLedgerStore implements LedgerRepository {
  constructor(private db: Database = businessDatabase()) {}

  hasEntry(holderAccountId: AccountId, asset: AssetCode, source: LedgerSource, sourceRef: string) {
    return this.db.transaction(
      async (sql) =>
        !!(
          await sql.query(
            `SELECT 1 FROM asset_ledger_entries
           WHERE member_id=$1 AND asset_code::text=$2 AND source_context=$3 AND source_type=$4 AND source_ref=$5`,
            [holderAccountId, asset, source.context, source.type, sourceRef],
          )
        ).rows.length,
    );
  }
}

export async function sumLedgerUnits(
  sql: Sql,
  holderAccountId: AccountId,
  asset: AssetCode,
): Promise<number> {
  const row = (
    await sql.query(
      "SELECT COALESCE(SUM(amount_units),0) AS units FROM asset_ledger_entries WHERE member_id=$1 AND asset_code::text=$2",
      [holderAccountId, asset],
    )
  ).rows[0] as { units: number | string } | undefined;
  return Number(row?.units ?? 0);
}
