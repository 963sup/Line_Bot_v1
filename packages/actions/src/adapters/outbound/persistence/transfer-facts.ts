import type { Sql } from "@line_bot_v1/platform/postgres";
import type { ActionTransferFacts } from "../../../contracts/output/transfer-facts.js";

function count(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed < 0)
    throw new TypeError("Invalid Actions transfer fact count.");
  return parsed;
}

export class PostgresActionTransferFacts implements ActionTransferFacts {
  constructor(private readonly sql: Sql) {}

  async read(projectId: string): Promise<number> {
    const row = (
      await this.sql.query(
        `SELECT sum(facts.rows)::bigint AS count
         FROM (
           SELECT count(*)::bigint AS rows FROM action_rules
           UNION ALL SELECT count(*)::bigint FROM action_rule_versions
           UNION ALL SELECT count(*)::bigint FROM action_events
           UNION ALL SELECT count(*)::bigint FROM action_runs
           UNION ALL SELECT count(*)::bigint FROM action_attempts
           UNION ALL SELECT count(*)::bigint FROM action_commands
           UNION ALL SELECT count(*)::bigint FROM project_action_rules WHERE project_id=$1
           UNION ALL SELECT count(*)::bigint FROM project_action_rule_versions v JOIN project_action_rules r ON r.id=v.rule_id WHERE r.project_id=$1
           UNION ALL SELECT count(*)::bigint FROM project_action_events WHERE project_id=$1
           UNION ALL SELECT count(*)::bigint FROM project_action_runs WHERE project_id=$1
           UNION ALL SELECT count(*)::bigint FROM project_action_attempts a JOIN project_action_runs r ON r.id=a.run_id WHERE r.project_id=$1
           UNION ALL SELECT count(*)::bigint FROM project_action_commands WHERE result->'rule'->>'projectId'=$1 OR result->'run'->>'projectId'=$1
         ) facts`,
        [projectId],
      )
    ).rows[0];
    return count(row?.count);
  }
}
