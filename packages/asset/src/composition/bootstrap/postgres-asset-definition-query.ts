import type { Sql } from "@line_bot_v1/platform/postgres";
import { PostgresAssetDefinitionRepository } from "../../adapters/outbound/persistence/postgres-asset-definition-repository.js";
import {
  type AssetDefinitionQuery,
  createAssetDefinitionQuery,
} from "../../application/queries/asset-definition.js";

export function createPostgresAssetDefinitionQuery(sql: Sql): AssetDefinitionQuery {
  return createAssetDefinitionQuery(new PostgresAssetDefinitionRepository(sql));
}
