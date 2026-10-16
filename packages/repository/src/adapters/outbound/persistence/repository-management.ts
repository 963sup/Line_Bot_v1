import { createHash } from "node:crypto";
import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import type { Database, Sql, SqlRow } from "@line_bot_v1/platform/postgres";
import { booleanValue, numericValue, stringValue } from "@line_bot_v1/platform/validation";
import type {
  RepositoryLifecycleSaveResult,
  RepositoryManagementEvidence,
  RepositoryManagementPersistence,
  RepositoryManagementTransaction,
} from "../../../contracts/output/repository-management.js";
import type {
  RepositoryLifecycleDecision,
  RepositoryLifecycleState,
} from "../../../domain/repository/entities/repository.js";
import { hasRepositoryPermission } from "../../../domain/repository/value-objects/repository-capability.js";
import {
  decodeCommandRow,
  decodePermissionsRow,
  postgresErrorCode,
  repositoryOwnerKind,
  repositoryVisibility,
} from "../../../postgres/decode.js";

export const repositoryLifecycleColumns =
  "id,owner_account_id,owner_account_kind,name,visibility,is_archived,version";

export function decodeRepositoryLifecycle(row: SqlRow): RepositoryLifecycleState {
  return {
    id: stringValue(row.id),
    ownerAccountId: stringValue(row.owner_account_id),
    ownerKind: repositoryOwnerKind(row.owner_account_kind),
    name: stringValue(row.name),
    visibility: repositoryVisibility(row.visibility),
    archived: booleanValue(row.is_archived),
    version: Number(numericValue(row.version)),
  };
}

const fingerprint = (payload: string) => createHash("sha256").update(payload).digest("hex");

class PostgresRepositoryManagementTransaction implements RepositoryManagementTransaction {
  constructor(private readonly sql: Sql) {}

  async hasCurrentUpdateQualification(userId: string): Promise<boolean> {
    return Boolean(await readActiveUserQualification(this.sql, userId, "update"));
  }

  async loadForUpdate(repositoryId: string): Promise<RepositoryLifecycleState | null> {
    return (
      (
        await this.sql.query(
          `SELECT ${repositoryLifecycleColumns} FROM repositories WHERE id=$1 FOR UPDATE`,
          [repositoryId],
          decodeRepositoryLifecycle,
        )
      ).rows[0] ?? null
    );
  }

  async hasCurrentAdmin(repositoryId: string, userId: string): Promise<boolean> {
    const row = (
      await this.sql.query(
        "SELECT permissions FROM repository_effective_access WHERE repository_id=$1 AND user_id=$2",
        [repositoryId, userId],
        decodePermissionsRow,
      )
    ).rows[0];
    return hasRepositoryPermission(row?.permissions ?? [], "admin");
  }

  async lockRequest(userId: string, requestId: string): Promise<void> {
    await this.sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `repository-command:${userId}:${requestId}`,
    ]);
  }

  async evidence(
    userId: string,
    requestId: string,
    payload: string,
  ): Promise<RepositoryManagementEvidence | null> {
    const previous = (
      await this.sql.query(
        "SELECT fingerprint,result FROM repository_commands WHERE actor=$1 AND request_id=$2",
        [userId, requestId],
        decodeCommandRow,
      )
    ).rows[0];
    return previous
      ? { matches: previous.fingerprint === fingerprint(payload), value: previous.result }
      : null;
  }

  async nameReserved(repository: RepositoryLifecycleState, name: string): Promise<boolean> {
    const current = (
      await this.sql.query(
        `SELECT 1
         FROM repositories
         WHERE owner_account_id=$1
           AND owner_account_kind=$2
           AND id<>$3
           AND lower(name)=lower($4)
         LIMIT 1`,
        [repository.ownerAccountId, repository.ownerKind, repository.id, name],
      )
    ).rows[0];
    if (current) return true;
    return Boolean(
      (
        await this.sql.query(
          `SELECT 1
           FROM repository_name_history h
           JOIN repositories historical_repository
             ON historical_repository.id=h.repository_id
           WHERE historical_repository.owner_account_id=$1
             AND historical_repository.owner_account_kind=$2
             AND historical_repository.id<>$3
             AND lower(h.old_name)=lower($4)
           LIMIT 1`,
          [repository.ownerAccountId, repository.ownerKind, repository.id, name],
        )
      ).rows[0],
    );
  }

  async internalEnterpriseId(organizationAccountId: string): Promise<string | null> {
    const row = (
      await this.sql.query(
        `SELECT enterprise_account_id
         FROM repository_internal_scopes
         WHERE organization_account_id=$1
         LIMIT 1`,
        [organizationAccountId],
        (value) => ({ enterpriseAccountId: stringValue(value.enterprise_account_id) }),
      )
    ).rows[0];
    return row?.enterpriseAccountId ?? null;
  }

  async save(
    decision: RepositoryLifecycleDecision,
    now: number,
  ): Promise<RepositoryLifecycleSaveResult> {
    if (decision.action === "rename") {
      await this.sql.query(
        `INSERT INTO repository_name_history(repository_id,old_name,renamed_at)
         VALUES($1,$2,$3)
         ON CONFLICT DO NOTHING`,
        [decision.previous.id, decision.previous.name, now],
      );
    }
    try {
      const changed = (
        await this.sql.query(
          `UPDATE repositories
           SET name=$2,visibility=$3,is_archived=$4,version=$5
           WHERE id=$1 AND version=$6
           RETURNING id`,
          [
            decision.current.id,
            decision.current.name,
            decision.current.visibility,
            decision.current.archived,
            decision.current.version,
            decision.previous.version,
          ],
        )
      ).rows[0];
      return changed ? "saved" : "version-conflict";
    } catch (error) {
      if (decision.action === "rename" && postgresErrorCode(error) === "23505") {
        return "duplicate-name";
      }
      throw error;
    }
  }

  async record(args: {
    actorUserId: string;
    requestId: string;
    payload: string;
    decision: RepositoryLifecycleDecision;
    evidence: unknown;
    at: number;
  }): Promise<void> {
    const state = (repository: RepositoryLifecycleState) => ({
      name: repository.name,
      visibility: repository.visibility,
      archived: repository.archived,
      version: repository.version,
    });
    await this.sql.query(
      `INSERT INTO repository_events(
         repository_id,actor_user_id,action,previous_state,current_state,at
       ) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)`,
      [
        args.decision.current.id,
        args.actorUserId,
        args.decision.action,
        JSON.stringify(state(args.decision.previous)),
        JSON.stringify(state(args.decision.current)),
        args.at,
      ],
    );
    await this.sql.query(
      `INSERT INTO repository_commands(actor,request_id,fingerprint,result,at)
       VALUES($1,$2,$3,$4::jsonb,$5)`,
      [
        args.actorUserId,
        args.requestId,
        fingerprint(args.payload),
        JSON.stringify(args.evidence),
        args.at,
      ],
    );
  }
}

export class PostgresRepositoryManagementPersistence implements RepositoryManagementPersistence {
  constructor(private readonly db: Database) {}

  transact<T>(work: (transaction: RepositoryManagementTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT app_private.lock_governance('exclusive')");
      return work(new PostgresRepositoryManagementTransaction(sql));
    });
  }
}
