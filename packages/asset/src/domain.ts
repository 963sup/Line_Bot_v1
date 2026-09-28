export type AssetCode = "coin";

export type AssetDefinition = Readonly<{
  code: AssetCode;
  displayName: string;
  unitsPerWhole: number;
}>;

/** Stable identifier; denomination is persisted by the Asset Context. */
export const COIN_ASSET_CODE: AssetCode = "coin";

export function assetAmount(definition: AssetDefinition, units: number): number {
  if (!Number.isSafeInteger(units)) throw new Error("invalid_asset_units");
  if (!Number.isSafeInteger(definition.unitsPerWhole) || definition.unitsPerWhole <= 0)
    throw new Error("invalid_asset_definition");
  return units / definition.unitsPerWhole;
}
