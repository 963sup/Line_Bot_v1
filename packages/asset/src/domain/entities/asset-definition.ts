import type { AssetCode } from "../value-objects/asset-code.js";

export type AssetDefinition = Readonly<{
  code: AssetCode;
  displayName: string;
  unitsPerWhole: number;
}>;

export function assetAmount(definition: AssetDefinition, units: number): number {
  if (!Number.isSafeInteger(units)) throw new Error("invalid_asset_units");
  if (!Number.isSafeInteger(definition.unitsPerWhole) || definition.unitsPerWhole <= 0)
    throw new Error("invalid_asset_definition");
  return units / definition.unitsPerWhole;
}
