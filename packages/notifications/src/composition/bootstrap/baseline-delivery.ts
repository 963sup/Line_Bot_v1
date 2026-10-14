import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresBaselineDeliveryStore } from "../../adapters/outbound/persistence/baseline-delivery.js";
import type { BaselineDeliveryStore } from "../../contracts/repositories/baseline-delivery.js";
export function createPostgresBaselineDeliveryStore(
  db: Database,
  provider: string,
): BaselineDeliveryStore {
  return new PostgresBaselineDeliveryStore(db, provider);
}
