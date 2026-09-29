import type { AssetDefinition } from "../../domain/entities/asset-definition.js";
import type { AssetCode } from "../../domain/value-objects/asset-code.js";

export interface AssetDefinitionRepository {
  findByCode(asset: AssetCode): Promise<AssetDefinition | null>;
}
