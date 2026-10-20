import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import type {
  ProjectManagementIdentity,
  ProjectManagementReceipt,
} from "../../../contracts/management.js";
import type {
  ProjectLifecycleCommand,
  ProjectLifecyclePersistence,
  ProjectLifecycleTransaction,
} from "../../../contracts/output/project-lifecycle.js";
import { ProjectError } from "../../../domain.js";
import {
  advanceProject,
  appendProjectEvent,
  lockProjectScope,
  type ProjectRow,
  projectFingerprint,
  readProjectReceipt,
  readProjectScope,
  storeProjectReceipt,
} from "./postgres-project-management-helpers.js";

export class PostgresProjectLifecycle implements ProjectLifecyclePersistence {
  constructor(private readonly db: Database = businessDatabase()) {}

  transact<T>(
    identity: ProjectManagementIdentity,
    command: ProjectLifecycleCommand,
    operation: (transaction: ProjectLifecycleTransaction) => Promise<T>,
  ): Promise<T> {
    const fingerprint = projectFingerprint(command);
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT app_private.lock_governance('shared')");
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `project-request:${identity.userId}:${command.requestId}`,
      ]);
      let current: ProjectRow | undefined;
      return operation({
        async replay() {
          const replay = await readProjectReceipt(
            sql,
            identity.userId,
            command.requestId,
            fingerprint,
          );
          if (replay) await readProjectScope(sql, identity.userId, replay.projectId, true);
          return replay;
        },
        async load() {
          const { row, role } = await lockProjectScope(sql, identity.userId, command.projectId);
          current = row;
          return { state: { version: Number(row.version), closed: row.closed }, role };
        },
        async save(change, now) {
          if (!current) throw new ProjectError(503, "Project 尚未載入。");
          const next = await advanceProject(sql, current, command.expectedVersion, now, change);
          const data = { closed: change.closed };
          await appendProjectEvent(
            sql,
            current.id,
            Number(next.version),
            identity.userId,
            command.action,
            data,
            now,
          );
          const result: ProjectManagementReceipt = {
            requestId: command.requestId,
            action: command.action,
            projectId: current.id,
            resourceId: null,
            version: Number(next.version),
            at: now,
            data,
          };
          await storeProjectReceipt(sql, identity.userId, fingerprint, result, now);
          return result;
        },
      });
    });
  }
}
