import type { Sql } from "@line_bot_v1/platform/postgres";
import type { AssetDefinition } from "../domain/entities/asset-definition.js";
import type { AssetCode } from "../domain/value-objects/asset-code.js";

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
