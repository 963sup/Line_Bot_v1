import type { Sql } from "@line_bot_v1/platform/postgres";
import type { WbsScopeBoundary } from "../../../contracts/output/scope-boundary.js";
import { WbsError } from "../../../domain/document.js";

export class PostgresWbsScopeBoundary implements WbsScopeBoundary {
  constructor(private readonly sql: Sql) {}

  async repositoryAvailable(_repositoryId: string): Promise<void> {
    await this.lockCurrentState();
    if (
      (await this.sql.query("SELECT 1 FROM wbs_scope_transfers WHERE state='ACTIVE' LIMIT 1")).rows
        .length
    ) {
      throw new WbsError(410, "Repository WBS 已轉移至 Project。");
    }
  }

  async legacyQueueAvailable(): Promise<boolean> {
    await this.lockCurrentState();
    // Activation validates that exactly one legacy Repository WBS exists and it is the source,
    // so any ACTIVE marker durably retires the one global legacy outbox scan.
    return !(await this.sql.query("SELECT 1 FROM wbs_scope_transfers WHERE state='ACTIVE' LIMIT 1"))
      .rows.length;
  }

  async projectWritable(projectId: string): Promise<void> {
    await this.lockCurrentState();
    if (
      (
        await this.sql.query(
          "SELECT 1 FROM wbs_scope_transfers WHERE project_id=$1 AND state='REQUESTED'",
          [projectId],
        )
      ).rows.length
    ) {
      throw new WbsError(409, "WBS scope migration 尚未完成。");
    }
  }

  private async lockCurrentState() {
    await this.sql.query("SELECT app_private.lock_governance('shared')");
  }
}
