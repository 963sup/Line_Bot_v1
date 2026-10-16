import { createHash, randomUUID } from "node:crypto";
import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import { readAccountLogin } from "@line_bot_v1/namespace/postgres";
import { readOrganizationViewerCapabilities } from "@line_bot_v1/organization/postgres";
import type { Database, Sql, SqlRow } from "@line_bot_v1/platform/postgres";
import { numericValue, stringValue } from "@line_bot_v1/platform/validation";
import type { RepositoryCreationResult } from "../../../contracts/input/repository-creation.js";
import type {
  RepositoryCreationEvidence,
  RepositoryCreationPersistence,
  RepositoryCreationTransaction,
  RepositoryProvisionResult,
} from "../../../contracts/output/repository-creation.js";
import type {
  RepositoryLifecycleState,
  RepositoryVisibility,
} from "../../../domain/repository/entities/repository.js";
import {
  decodeCommandRow,
  postgresErrorCode,
  postgresErrorConstraint,
  repositoryOwnerKind,
  repositoryVisibility,
} from "../../../postgres/decode.js";

const fingerprint = (payload: string) => createHash("sha256").update(payload).digest("hex");

function decodeRepositoryResultRow(row: SqlRow) {
  return {
    id: stringValue(row.id),
    owner_account_id: stringValue(row.owner_account_id),
    owner_account_kind: repositoryOwnerKind(row.owner_account_kind),
    name: stringValue(row.name),
    visibility: repositoryVisibility(row.visibility),
    version: Number(numericValue(row.version)),
  };
}

class PostgresRepositoryCreationTransaction implements RepositoryCreationTransaction {
  constructor(private readonly sql: Sql) {}

  async hasCurrentUpdateQualification(userId: string): Promise<boolean> {
    return Boolean(await readActiveUserQualification(this.sql, userId, "update"));
  }

  async organizationCanCreate(
    userId: string,
    organizationAccountId: string,
    visibility: RepositoryVisibility,
  ): Promise<boolean> {
    const capabilities = await readOrganizationViewerCapabilities(
      this.sql,
      userId,
      organizationAccountId,
    );
    return Boolean(capabilities?.viewerCanCreateRepositoryVisibilities[visibility]);
  }

  async ownerLogin(
    ownerAccountId: string,
    ownerKind: RepositoryLifecycleState["ownerKind"],
  ): Promise<string | null> {
    return (await readAccountLogin(this.sql, ownerAccountId, ownerKind))?.login ?? null;
  }

  async internalEligible(organizationAccountId: string): Promise<boolean> {
    return Boolean(
      (
        await this.sql.query(
          "SELECT 1 FROM repository_internal_scopes WHERE organization_account_id=$1 LIMIT 1",
          [organizationAccountId],
        )
      ).rows[0],
    );
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
    legacyPayload: string | null,
  ): Promise<RepositoryCreationEvidence | null> {
    const previous = (
      await this.sql.query(
        "SELECT fingerprint,result FROM repository_commands WHERE actor=$1 AND request_id=$2",
        [userId, requestId],
        decodeCommandRow,
      )
    ).rows[0];
    if (!previous) return null;
    const currentFingerprint = fingerprint(payload);
    return {
      matches:
        previous.fingerprint === currentFingerprint ||
        (legacyPayload !== null && previous.fingerprint === fingerprint(legacyPayload)),
      value: previous.result,
    };
  }

  allocateId(): string {
    return randomUUID();
  }

  async provision(
    actorUserId: string,
    repository: RepositoryLifecycleState,
  ): Promise<RepositoryProvisionResult> {
    try {
      await this.sql.query("SELECT * FROM app_private.provision_repository($1,$2,$3,$4,$5,$6)", [
        repository.id,
        actorUserId,
        repository.ownerAccountId,
        repository.ownerKind,
        repository.name,
        repository.visibility,
      ]);
      return "created";
    } catch (error) {
      const code = postgresErrorCode(error);
      const constraint = postgresErrorConstraint(error);
      if (
        code === "23505" &&
        (constraint === "repositories_owner_name" ||
          constraint === "repository_name_history_reserved")
      ) {
        return "duplicate-name";
      }
      if (code === "23514" && constraint === "repository_internal_scope_missing") {
        return "internal-scope-changed";
      }
      if (code === "42501") return "owner-qualification-changed";
      throw error;
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

  async result(repositoryId: string, ownerLogin: string): Promise<RepositoryCreationResult | null> {
    const row = (
      await this.sql.query(
        `SELECT id,owner_account_id,owner_account_kind,name,visibility,version
         FROM repositories
         WHERE id=$1`,
        [repositoryId],
        decodeRepositoryResultRow,
      )
    ).rows[0];
    return row
      ? {
          id: row.id,
          ownerAccountId: row.owner_account_id,
          ownerKind: row.owner_account_kind,
          ownerLogin,
          name: row.name,
          visibility: row.visibility,
          version: row.version,
        }
      : null;
  }
}

export class PostgresRepositoryCreationPersistence implements RepositoryCreationPersistence {
  constructor(private readonly db: Database) {}

  transact<T>(work: (transaction: RepositoryCreationTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT app_private.lock_governance('shared')");
      return work(new PostgresRepositoryCreationTransaction(sql));
    });
  }
}
