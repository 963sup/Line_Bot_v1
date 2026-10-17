import { randomUUID } from "node:crypto";
import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import type { Database, Sql } from "@line_bot_v1/platform/postgres";
import { isRecord } from "@line_bot_v1/platform/validation";
import { createPostgresProjectContentScope } from "@line_bot_v1/project/composition/bootstrap/project-content-scope";
import { createPostgresWbsScopeBoundary } from "@line_bot_v1/wbs/composition/bootstrap/scope-boundary";
import type {
  ProjectWbsBaselineEvent,
  ProjectWbsBaselineEvents,
} from "@line_bot_v1/wbs/contracts/output/project-baseline-events";
import type {
  ProjectActionTransaction,
  ProjectActionTransactions,
} from "../../../contracts/output/project-automation.js";
import type {
  ProjectActionLease,
  ProjectActionRunQueue,
} from "../../../contracts/output/project-worker.js";
import {
  type ProjectActionRule,
  type ProjectActionRun,
  ProjectActionsError,
} from "../../../domain/project-automation.js";
import { rule, run } from "./project-decode.js";

async function scope(sql: Sql, userId: string, projectId: string) {
  const access = await createPostgresProjectContentScope(sql).read(userId, projectId);
  await createPostgresWbsScopeBoundary(sql).projectWritable(projectId);
  const qualification = await readActiveUserQualification(sql, userId, "share");
  if (!qualification) throw new ProjectActionsError(403, "委派資格不可用。");
  return {
    role: access.role,
    closed: access.closed,
    transferRequested: false,
    qualificationVersion: qualification.statusVersion,
  };
}
async function loadRule(sql: Sql, projectId: string, id: string) {
  return (
    (
      await sql.query(
        "SELECT v.snapshot FROM project_action_rules h JOIN project_action_rule_versions v ON v.rule_id=h.id AND v.version=h.version WHERE h.project_id=$1 AND h.id=$2",
        [projectId, id],
        (r) => ({ rule: rule(r.snapshot) }),
      )
    ).rows[0]?.rule ?? null
  );
}
async function rules(sql: Sql, projectId: string) {
  return (
    await sql.query(
      "SELECT v.snapshot FROM project_action_rules h JOIN project_action_rule_versions v ON v.rule_id=h.id AND v.version=h.version WHERE h.project_id=$1 ORDER BY h.id LIMIT 101",
      [projectId],
      (r) => ({ rule: rule(r.snapshot) }),
    )
  ).rows.map((r) => r.rule);
}
async function saveRun(sql: Sql, value: ProjectActionRun, eventId: string | null = null) {
  const saved = await sql.query(
    `INSERT INTO project_action_runs(id,project_id,rule_id,rule_version,rule_snapshot,revision_id,baseline_id,source_event_id,status,version,step,attempt,available_at,created_at,results)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status,version=excluded.version,step=excluded.step,attempt=excluded.attempt,available_at=excluded.available_at,results=excluded.results
    WHERE project_action_runs.project_id=excluded.project_id AND project_action_runs.version=excluded.version-1 RETURNING id`,
    [
      value.id,
      value.projectId,
      value.rule.id,
      value.rule.version,
      JSON.stringify(value.rule),
      value.revisionId,
      value.baselineId,
      eventId,
      value.status,
      value.version,
      value.step,
      value.attempt,
      value.due,
      value.createdAt,
      JSON.stringify(value.results),
    ],
  );
  if (!saved.rows.length) throw new ProjectActionsError(409, "執行版本衝突。");
}
export class PostgresProjectActionPersistence
  implements ProjectActionTransactions, ProjectActionRunQueue
{
  constructor(
    private db: Database,
    private events: (sql: Sql) => ProjectWbsBaselineEvents,
  ) {}
  transact<T>(
    userId: string,
    projectId: string,
    work: (tx: ProjectActionTransaction) => Promise<T>,
  ) {
    return this.db.transaction(async (sql) => {
      const currentScope = await scope(sql, userId, projectId);
      const tx: ProjectActionTransaction = {
        scope: currentScope,
        id: randomUUID,
        cursor: () => this.events(sql).cursor(projectId),
        async replay(requestId, fingerprint) {
          await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            `project-action-command:${userId}:${requestId}`,
          ]);
          const row = (
            await sql.query(
              "SELECT fingerprint,result FROM project_action_commands WHERE actor=$1 AND request_id=$2",
              [userId, requestId],
            )
          ).rows[0];
          if (!row) return null;
          if (row.fingerprint !== fingerprint)
            throw new ProjectActionsError(409, "請求編號已被不同命令使用。");
          const value = row.result;
          if (!isRecord(value)) throw new TypeError("Invalid receipt.");
          if ("rule" in value) return { rule: rule(value.rule) };
          // Durable snapshots are decoded into internal Domain state before Application projection.
          if (!isRecord(value.run)) throw new TypeError("Invalid receipt.");
          const v = value.run;
          return {
            run: run({
              id: v.id,
              project_id: v.projectId,
              rule_snapshot: v.rule,
              revision_id: v.revisionId,
              baseline_id: v.baselineId,
              status: v.status,
              version: v.version,
              step: v.step,
              attempt: v.attempt,
              available_at: v.due,
              created_at: v.createdAt,
              results: v.results,
            }),
          };
        },
        async receipt(requestId, fingerprint, result, now) {
          await sql.query(
            "INSERT INTO project_action_commands(actor,request_id,fingerprint,result,at) VALUES($1,$2,$3,$4::jsonb,$5)",
            [userId, requestId, fingerprint, JSON.stringify(result), now],
          );
        },
        rules: {
          list: () => rules(sql, projectId),
          load: (id) => loadRule(sql, projectId, id),
          async save(value, expectedVersion) {
            if (value.version !== expectedVersion + 1)
              throw new ProjectActionsError(409, "規則版本衝突。");
            const changed = await sql.query(
              "INSERT INTO project_action_rules(id,project_id,version) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET version=excluded.version WHERE project_action_rules.project_id=excluded.project_id AND project_action_rules.version=excluded.version-1 RETURNING id",
              [value.id, projectId, value.version],
            );
            if (!changed.rows.length) throw new ProjectActionsError(409, "規則版本衝突。");
            await sql.query(
              "INSERT INTO project_action_rule_versions(rule_id,version,snapshot) VALUES($1,$2,$3::jsonb)",
              [value.id, value.version, JSON.stringify(value)],
            );
          },
        },
        runs: {
          async load(id) {
            return (
              (
                await sql.query(
                  "SELECT * FROM project_action_runs WHERE project_id=$1 AND id=$2 FOR UPDATE",
                  [projectId, id],
                  run,
                )
              ).rows[0] ?? null
            );
          },
          async save(value, expectedVersion, at) {
            if (value.version !== expectedVersion + 1)
              throw new ProjectActionsError(409, "執行版本衝突。");
            await saveRun(sql, value);
            if (value.status === "cancelled") {
              await sql.query(
                "UPDATE project_action_attempts SET finished_at=$2,result=$3::jsonb WHERE run_id=$1 AND finished_at IS NULL",
                [
                  value.id,
                  at,
                  JSON.stringify({ status: "cancelled", effect: "in-flight-outcome-unknown" }),
                ],
              );
              await sql.query(
                "UPDATE project_action_runs SET lease_token=NULL,lease_until=NULL WHERE id=$1",
                [value.id],
              );
            }
          },
        },
      };
      return work(tx);
    });
  }
  accept(
    event: ProjectWbsBaselineEvent,
    work: (
      rules: ProjectActionRule[],
      insert: (run: ProjectActionRun) => Promise<void>,
      id: () => string,
    ) => Promise<void>,
  ) {
    return this.db.transaction(async (sql) => {
      await createPostgresWbsScopeBoundary(sql).projectWritable(event.projectId);
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `project-action-event:${event.id}`,
      ]);
      // Freeze the complete fan-out at first acceptance, including the empty-rule case.
      if (
        (await sql.query("SELECT id FROM project_action_events WHERE id=$1", [event.id])).rows
          .length
      )
        return;
      await sql.query("INSERT INTO project_action_events(id,project_id,at) VALUES($1,$2,$3)", [
        event.id,
        event.projectId,
        event.at,
      ]);
      await work(
        await rules(sql, event.projectId),
        (value) => saveRun(sql, value, event.id),
        randomUUID,
      );
    });
  }
  claim(now: number) {
    return this.db.transaction(async (sql) => {
      const token = randomUUID();
      const row = (
        await sql.query(
          `UPDATE project_action_runs SET status='running',version=version+1,attempt=attempt+1,lease_token=$2,lease_until=$1+90000
        WHERE id=(SELECT id FROM project_action_runs WHERE ((status IN ('queued','waiting') AND available_at<=$1) OR (status='running' AND lease_until<=$1)) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
        RETURNING *`,
          [now, token],
        )
      ).rows[0];
      if (!row) return null;
      const value = run(row);
      await sql.query(
        "UPDATE project_action_attempts SET finished_at=$2,result=$3::jsonb WHERE run_id=$1 AND finished_at IS NULL",
        [value.id, now, JSON.stringify({ status: "lease-expired", effect: "unknown" })],
      );
      await sql.query(
        "INSERT INTO project_action_attempts(run_id,number,lease_token,started_at) VALUES($1,$2,$3,$4)",
        [value.id, value.attempt, token, now],
      );
      return { run: value, token, until: now + 90000 };
    });
  }
  inspect(lease: ProjectActionLease, now: number) {
    return this.db.transaction(async (sql) => {
      try {
        await createPostgresWbsScopeBoundary(sql).projectWritable(lease.run.projectId);
      } catch (error) {
        if (isRecord(error) && error.status === 409) return null;
        throw error;
      }
      // Use the universal qualification -> governance -> Project -> aggregate order.
      let currentScope: Awaited<ReturnType<typeof scope>> | null = null;
      try {
        currentScope = await scope(sql, lease.run.rule.delegate, lease.run.projectId);
      } catch (error) {
        if (
          !(
            isRecord(error) &&
            typeof error.status === "number" &&
            [401, 403, 404].includes(error.status)
          )
        )
          throw error;
      }
      const row = (
        await sql.query(
          "SELECT * FROM project_action_runs WHERE id=$1 AND lease_token=$2 AND lease_until>$3 AND status='running' FOR SHARE",
          [lease.run.id, lease.token, now],
          run,
        )
      ).rows[0];
      if (!row) return null;
      return {
        run: row,
        rule: await loadRule(sql, row.projectId, row.rule.id),
        scope: currentScope,
      };
    });
  }
  finish(
    lease: ProjectActionLease,
    now: number,
    work: (run: ProjectActionRun) => ProjectActionRun,
  ) {
    return this.db.transaction(async (sql) => {
      try {
        await createPostgresWbsScopeBoundary(sql).projectWritable(lease.run.projectId);
      } catch (error) {
        if (isRecord(error) && error.status === 409) return false;
        throw error;
      }
      const current = (
        await sql.query(
          "SELECT * FROM project_action_runs WHERE id=$1 AND lease_token=$2 AND lease_until>$3 AND status='running' FOR UPDATE",
          [lease.run.id, lease.token, now],
          run,
        )
      ).rows[0];
      if (!current) return false;
      const next = work(current);
      await saveRun(sql, next);
      await sql.query(
        "UPDATE project_action_runs SET lease_token=NULL,lease_until=NULL WHERE id=$1",
        [current.id],
      );
      await sql.query(
        "UPDATE project_action_attempts SET finished_at=$3,result=$4::jsonb WHERE run_id=$1 AND lease_token=$2",
        [
          current.id,
          lease.token,
          now,
          JSON.stringify({
            status: next.status,
            step: current.step,
            value: next.results.find((r) => r.step === current.step)?.value ?? null,
          }),
        ],
      );
      return true;
    });
  }
}
