import type { Sql } from "@line_bot_v1/platform/postgres";
import type { NotificationTransferFacts } from "../../../contracts/output/transfer-facts.js";

function count(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed < 0)
    throw new TypeError("Invalid Notifications transfer fact count.");
  return parsed;
}

export class PostgresNotificationTransferFacts implements NotificationTransferFacts {
  constructor(private readonly sql: Sql) {}

  async read(): Promise<number> {
    const row = (
      await this.sql.query(
        "SELECT count(*)::bigint AS count FROM notifications WHERE source_type='wbs-baseline'",
      )
    ).rows[0];
    return count(row?.count);
  }
}
