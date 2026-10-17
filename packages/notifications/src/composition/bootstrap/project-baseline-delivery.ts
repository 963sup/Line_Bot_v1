import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresProjectBaselineDeliveryStore } from "../../adapters/outbound/persistence/project-baseline-delivery.js";
import type { ProjectBaselineDeliveryStore } from "../../contracts/repositories/project-baseline-delivery.js";
export function createPostgresProjectBaselineDeliveryStore(
  db: Database,
  provider: string,
): ProjectBaselineDeliveryStore {
  return new PostgresProjectBaselineDeliveryStore(db, provider);
}
