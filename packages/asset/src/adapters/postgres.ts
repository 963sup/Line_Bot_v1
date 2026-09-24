import type { Sql } from "@line-work/platform/adapters/postgres";
import type { AssetCode, AssetDefinition } from "../domain.js";

export async function readAssetDefinition(
  sql: Sql,
  asset: AssetCode,
): Promise<AssetDefinition | null> {
  const row = (
    await sql.query(
      "SELECT code,display_name,units_per_whole FROM asset_definitions WHERE code::text=$1",
      [asset],
    )
  ).rows[0] as
    | { code: AssetCode; display_name: string; units_per_whole: number | string }
    | undefined;
  return row
    ? {
        code: row.code,
        displayName: row.display_name,
        unitsPerWhole: Number(row.units_per_whole),
      }
    : null;
}
