import { randomUUID } from "node:crypto";
import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import type { Database, Sql } from "@line_bot_v1/platform/postgres";
import { isRecord } from "@line_bot_v1/platform/validation";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type {
  WbsBaselineEvent,
  WbsBaselineEvents,
} from "@line_bot_v1/wbs/contracts/output/baseline-events";
import type {
  ActionTransaction,
  ActionTransactions,
} from "../../../contracts/output/automation.js";
import type { ActionLease, ActionRunQueue } from "../../../contracts/output/worker.js";
import { type ActionRule, type ActionRun, ActionsError } from "../../../domain/automation.js";
import { rule, run } from "./decode.js";

async function scope(sql: Sql, userId: string, repositoryId: string) {
  const access = await repositoryContentScope(sql, userId, { repositoryId });
  const qualification = await readActiveUserQualification(sql, userId, "share");
  if (!qualification) throw new ActionsError(403, "委派資格不可用。");
  return {
    permissions: access.repository.permissions,
    archived: access.archived,
    qualificationVersion: qualification.statusVersion,
  };
}
async function loadRule(sql: Sql, repositoryId: string, id: string) {
  return (
    (
      await sql.query(
        "SELECT v.snapshot FROM action_rules h JOIN action_rule_versions v ON v.rule_id=h.id AND v.version=h.version WHERE h.repository_id=$1 AND h.id=$2",
        [repositoryId, id],
        (r) => ({ rule: rule(r.snapshot) }),
      )
    ).rows[0]?.rule ?? null
  );
}
async function rules(sql: Sql, repositoryId: string) {
  return (
    await sql.query(
      "SELECT v.snapshot FROM action_rules h JOIN action_rule_versions v ON v.rule_id=h.id AND v.version=h.version WHERE h.repository_id=$1 ORDER BY h.id LIMIT 101",
      [repositoryId],
      (r) => ({ rule: rule(r.snapshot) }),
    )
  ).rows.map((r) => r.rule);
}
async function saveRun(sql: Sql, value: ActionRun, eventId: string | null = null) {
  const saved = await sql.query(
    `INSERT INTO action_runs(id,repository_id,rule_id,rule_version,rule_snapshot,revision_id,baseline_id,source_event_id,status,version,step,attempt,available_at,created_at,results)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status,version=excluded.version,step=excluded.step,attempt=excluded.attempt,available_at=excluded.available_at,results=excluded.results
    WHERE action_runs.repository_id=excluded.repository_id AND action_runs.version=excluded.version-1 RETURNING id`,
    [
      value.id,
      value.repositoryId,
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
  if (!saved.rows.length) throw new ActionsError(409, "執行版本衝突。");
}
export class PostgresActionPersistence implements ActionTransactions, ActionRunQueue {
  constructor(
    private db: Database,
    private events: (sql: Sql) => WbsBaselineEvents,
  ) {}
  transact<T>(userId: string, repositoryId: string, work: (tx: ActionTransaction) => Promise<T>) {
    return this.db.transaction(async (sql) => {
      const currentScope = await scope(sql, userId, repositoryId);
      const tx: ActionTransaction = {
        scope: currentScope,
        id: randomUUID,
        cursor: () => this.events(sql).cursor(repositoryId),
        async replay(requestId, fingerprint) {
          await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            `action-command:${userId}:${requestId}`,
          ]);
          const row = (
            await sql.query(
              "SELECT fingerprint,result FROM action_commands WHERE actor=$1 AND request_id=$2",
              [userId, requestId],
            )
          ).rows[0];
          if (!row) return null;
          if (row.fingerprint !== fingerprint)
            throw new ActionsError(409, "請求編號已被不同命令使用。");
          const value = row.result;
          if (!isRecord(value)) throw new TypeError("Invalid receipt.");
          if ("rule" in value) return { rule: rule(value.rule) };
          // Durable snapshots are decoded into internal Domain state before Application projection.
          if (!isRecord(value.run)) throw new TypeError("Invalid receipt.");
          const v = value.run;
          return {
            run: run({
              id: v.id,
              repository_id: v.repositoryId,
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
            "INSERT INTO action_commands(actor,request_id,fingerprint,result,at) VALUES($1,$2,$3,$4::jsonb,$5)",
            [userId, requestId, fingerprint, JSON.stringify(result), now],
          );
        },
        rules: {
          list: () => rules(sql, repositoryId),
          load: (id) => loadRule(sql, repositoryId, id),
          async save(value, expectedVersion) {
            if (value.version !== expectedVersion + 1)
              throw new ActionsError(409, "規則版本衝突。");
            const changed = await sql.query(
              "INSERT INTO action_rules(id,repository_id,version) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET version=excluded.version WHERE action_rules.repository_id=excluded.repository_id AND action_rules.version=excluded.version-1 RETURNING id",
              [value.id, repositoryId, value.version],
            );
            if (!changed.rows.length) throw new ActionsError(409, "規則版本衝突。");
            await sql.query(
              "INSERT INTO action_rule_versions(rule_id,version,snapshot) VALUES($1,$2,$3::jsonb)",
              [value.id, value.version, JSON.stringify(value)],
            );
          },
        },
        runs: {
          async load(id) {
            return (
              (
                await sql.query(
                  "SELECT * FROM action_runs WHERE repository_id=$1 AND id=$2 FOR UPDATE",
                  [repositoryId, id],
                  run,
                )
              ).rows[0] ?? null
            );
          },
          async save(value, expectedVersion, at) {
            if (value.version !== expectedVersion + 1)
              throw new ActionsError(409, "執行版本衝突。");
            await saveRun(sql, value);
            if (value.status === "cancelled") {
              await sql.query(
                "UPDATE action_attempts SET finished_at=$2,result=$3::jsonb WHERE run_id=$1 AND finished_at IS NULL",
                [
                  value.id,
                  at,
                  JSON.stringify({ status: "cancelled", effect: "in-flight-outcome-unknown" }),
                ],
              );
              await sql.query(
                "UPDATE action_runs SET lease_token=NULL,lease_until=NULL WHERE id=$1",
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
    event: WbsBaselineEvent,
    work: (
      rules: ActionRule[],
      insert: (run: ActionRun) => Promise<void>,
      id: () => string,
    ) => Promise<void>,
  ) {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`action-event:${event.id}`]);
      // Freeze the complete fan-out at first acceptance, including the empty-rule case.
      if ((await sql.query("SELECT id FROM action_events WHERE id=$1", [event.id])).rows.length)
        return;
      await sql.query("INSERT INTO action_events(id,repository_id,at) VALUES($1,$2,$3)", [
        event.id,
        event.repositoryId,
        event.at,
      ]);
      await work(
        await rules(sql, event.repositoryId),
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
          `UPDATE action_runs SET status='running',version=version+1,attempt=attempt+1,lease_token=$2,lease_until=$1+90000
        WHERE id=(SELECT id FROM action_runs WHERE ((status IN ('queued','waiting') AND available_at<=$1) OR (status='running' AND lease_until<=$1)) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
        RETURNING *`,
          [now, token],
        )
      ).rows[0];
      if (!row) return null;
      const value = run(row);
      await sql.query(
        "UPDATE action_attempts SET finished_at=$2,result=$3::jsonb WHERE run_id=$1 AND finished_at IS NULL",
        [value.id, now, JSON.stringify({ status: "lease-expired", effect: "unknown" })],
      );
      await sql.query(
        "INSERT INTO action_attempts(run_id,number,lease_token,started_at) VALUES($1,$2,$3,$4)",
        [value.id, value.attempt, token, now],
      );
      return { run: value, token, until: now + 90000 };
    });
  }
  inspect(lease: ActionLease, now: number) {
    return this.db.transaction(async (sql) => {
      // Use the universal qualification -> governance -> Repository -> aggregate order.
      let currentScope: Awaited<ReturnType<typeof scope>> | null = null;
      try {
        currentScope = await scope(sql, lease.run.rule.delegate, lease.run.repositoryId);
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
          "SELECT * FROM action_runs WHERE id=$1 AND lease_token=$2 AND lease_until>$3 AND status='running' FOR SHARE",
          [lease.run.id, lease.token, now],
          run,
        )
      ).rows[0];
      if (!row) return null;
      return {
        run: row,
        rule: await loadRule(sql, row.repositoryId, row.rule.id),
        scope: currentScope,
      };
    });
  }
  finish(lease: ActionLease, now: number, work: (run: ActionRun) => ActionRun) {
    return this.db.transaction(async (sql) => {
      const current = (
        await sql.query(
          "SELECT * FROM action_runs WHERE id=$1 AND lease_token=$2 AND lease_until>$3 AND status='running' FOR UPDATE",
          [lease.run.id, lease.token, now],
          run,
        )
      ).rows[0];
      if (!current) return false;
      const next = work(current);
      await saveRun(sql, next);
      await sql.query("UPDATE action_runs SET lease_token=NULL,lease_until=NULL WHERE id=$1", [
        current.id,
      ]);
      await sql.query(
        "UPDATE action_attempts SET finished_at=$3,result=$4::jsonb WHERE run_id=$1 AND lease_token=$2",
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
