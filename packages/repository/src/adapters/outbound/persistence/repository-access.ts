import { createHash } from "node:crypto";
import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import type { Database, Sql, SqlRow } from "@line_bot_v1/platform/postgres";
import { numberValue, stringValue } from "@line_bot_v1/platform/validation";
import type {
  RepositoryAccessEvidence,
  RepositoryAccessMutationResult,
  RepositoryAccessPersistence,
  RepositoryAccessTransaction,
} from "../../../contracts/output/repository-access.js";
import { RepositoryError } from "../../../contracts/repository.js";
import type {
  RepositoryAccessGrantState,
  RepositoryAccessMutation,
  RepositoryAccessScope,
} from "../../../domain/repository/entities/repository.js";
import { hasRepositoryPermission } from "../../../domain/repository/value-objects/repository-capability.js";
import {
  decodeCommandRow,
  decodePermissionsRow,
  postgresErrorCode,
  repositoryOwnerKind,
  repositoryPermission,
} from "../../../postgres/decode.js";

const fingerprint = (payload: string) => createHash("sha256").update(payload).digest("hex");

function decodeRepositoryScope(row: SqlRow): RepositoryAccessScope {
  return {
    id: stringValue(row.id),
    ownerAccountId: stringValue(row.owner_account_id),
    ownerKind: repositoryOwnerKind(row.owner_account_kind),
  };
}

function mutationError(error: unknown): never {
  const code = postgresErrorCode(error);
  if (code === "22023") throw new RepositoryError(400, "Repository access 操作格式不正確。");
  if (code === "42501") throw new RepositoryError(403, "Repository access 資格不符。");
  if (code === "P0002") throw new RepositoryError(404, "找不到 Repository。");
  if (code === "40001" || code === "23503" || code === "23514") {
    throw new RepositoryError(409, "Repository access 狀態已變更，請重新載入。");
  }
  throw error;
}

class PostgresRepositoryAccessTransaction implements RepositoryAccessTransaction {
  constructor(private readonly sql: Sql) {}

  async hasCurrentUpdateQualification(userId: string): Promise<boolean> {
    return Boolean(await readActiveUserQualification(this.sql, userId, "update"));
  }

  async load(repositoryId: string): Promise<RepositoryAccessScope | null> {
    return (
      (
        await this.sql.query(
          `SELECT id,owner_account_id,owner_account_kind
         FROM repositories WHERE id=$1`,
          [repositoryId],
          decodeRepositoryScope,
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
    return Boolean(row && hasRepositoryPermission(row.permissions, "admin"));
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
  ): Promise<RepositoryAccessEvidence | null> {
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

  async currentGrant(
    repositoryId: string,
    subjectKind: RepositoryAccessMutation["subjectKind"],
    subjectId: string,
  ): Promise<RepositoryAccessGrantState | null> {
    const query =
      subjectKind === "USER"
        ? "SELECT capability,version FROM repository_access WHERE repository_id=$1 AND principal_id=$2"
        : "SELECT capability,version FROM repository_team_access WHERE repository_id=$1 AND team_id=$2";
    const row = (
      await this.sql.query(query, [repositoryId, subjectId], (value) => ({
        capability: repositoryPermission(value.capability),
        version: numberValue(value.version),
      }))
    ).rows[0];
    return row ?? null;
  }

  async targetUserActive(userId: string): Promise<boolean> {
    return Boolean(await readActiveUserQualification(this.sql, userId, "share"));
  }

  async mutate(
    actorUserId: string,
    repositoryId: string,
    mutation: RepositoryAccessMutation,
  ): Promise<RepositoryAccessMutationResult> {
    try {
      const changed = (
        await this.sql.query(
          `SELECT result_capability,result_version
           FROM app_private.mutate_repository_access($1,$2,$3,$4,$5,$6)`,
          [
            actorUserId,
            repositoryId,
            mutation.subjectKind,
            mutation.subjectId,
            mutation.capability,
            mutation.expectedVersion,
          ],
          (row) => ({
            capability:
              row.result_capability === null ? null : repositoryPermission(row.result_capability),
            version: row.result_version === null ? null : numberValue(row.result_version),
          }),
        )
      ).rows[0];
      if (!changed) throw new RepositoryError(503, "Repository access 更新結果不完整。");
      return changed;
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      mutationError(error);
    }
  }

  async record(args: {
    actorUserId: string;
    requestId: string;
    payload: string;
    evidence: unknown;
    at: number;
  }): Promise<void> {
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

export class PostgresRepositoryAccessPersistence implements RepositoryAccessPersistence {
  constructor(private readonly db: Database) {}

  transact<T>(work: (transaction: RepositoryAccessTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT app_private.lock_governance('exclusive')");
      return work(new PostgresRepositoryAccessTransaction(sql));
    });
  }
}
