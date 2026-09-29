import type { Sql } from "@line_bot_v1/platform/postgres";
import type { AssetDefinitionRepository } from "../../../contracts/repositories/asset-definition-repository.js";
import type { AssetDefinition } from "../../../domain/entities/asset-definition.js";
import { type AssetCode, COIN_ASSET_CODE } from "../../../domain/value-objects/asset-code.js";

export class PostgresAssetDefinitionRepository implements AssetDefinitionRepository {
  constructor(private readonly sql: Sql) {}

  async findByCode(asset: AssetCode): Promise<AssetDefinition | null> {
    const row: unknown = (
      await this.sql.query(
        "SELECT code,display_name,units_per_whole FROM asset_definitions WHERE code::text=$1",
        [asset],
      )
    ).rows[0];

    if (row === undefined) return null;
    return assetDefinitionFromRow(row);
  }
}

function assetDefinitionFromRow(row: unknown): AssetDefinition {
  if (
    typeof row !== "object" ||
    row === null ||
    !("code" in row) ||
    !("display_name" in row) ||
    !("units_per_whole" in row)
  ) {
    throw new Error("invalid_asset_definition");
  }

  const code = row.code;
  const displayName = row.display_name;
  const rawUnitsPerWhole = row.units_per_whole;

  if (
    code !== COIN_ASSET_CODE ||
    typeof displayName !== "string" ||
    (typeof rawUnitsPerWhole !== "number" && typeof rawUnitsPerWhole !== "string")
  ) {
    throw new Error("invalid_asset_definition");
  }

  const unitsPerWhole = Number(rawUnitsPerWhole);
  if (!Number.isSafeInteger(unitsPerWhole) || unitsPerWhole <= 0) {
    throw new Error("invalid_asset_definition");
  }

  return { code, displayName, unitsPerWhole };
}
