import type { AssetDefinitionRepository } from "../../contracts/repositories/asset-definition-repository.js";
import type { AssetDefinition } from "../../domain/entities/asset-definition.js";
import type { AssetCode } from "../../domain/value-objects/asset-code.js";

export type AssetDefinitionQuery = (asset: AssetCode) => Promise<AssetDefinition | null>;

export function createAssetDefinitionQuery(
  repository: AssetDefinitionRepository,
): AssetDefinitionQuery {
  return (asset) => repository.findByCode(asset);
}
