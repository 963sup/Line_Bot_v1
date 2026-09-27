import { createHash, randomUUID } from "node:crypto";
import {
  readAccountLogin,
  readActiveUserQualification,
} from "@line-work/account/adapters/postgres";
import {
  isOrganizationOwner,
  readOrganizationOwnerScopeIds,
} from "@line-work/identity-access/adapters/postgres";
import { businessDatabase, type Database, type Sql } from "@line-work/platform/adapters/postgres";
import type {
  RepositoryCreateCommand,
  RepositoryCreationResult,
  RepositoryCreationStore,
  RepositoryOwnerOption,
} from "../../application/ports/creation.js";
import { RepositoryError } from "../../domain.js";

const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function currentOwner(
  sql: Sql,
  actorUserId: string,
  command: Pick<RepositoryCreateCommand, "ownerAccountId" | "ownerKind">,
): Promise<RepositoryOwnerOption> {
  const actor = await readActiveUserQualification(sql, actorUserId, "update");
  if (!actor) throw new RepositoryError(403, "目前 User 資格不能建立 Repository。");

  if (command.ownerKind === "USER") {
    if (command.ownerAccountId !== actorUserId) {
      throw new RepositoryError(403, "只能在自己的 User 帳號下建立 Repository。");
    }
    const locator = await readAccountLogin(sql, actorUserId, "USER");
    if (!locator) throw new RepositoryError(409, "目前 User login 不可用。");
    return { id: actorUserId, kind: "USER", login: locator.login };
  }

  if (!(await isOrganizationOwner(sql, command.ownerAccountId, actorUserId))) {
    throw new RepositoryError(403, "需要 current OrganizationOwner 才能建立 Repository。");
  }
  const locator = await readAccountLogin(sql, command.ownerAccountId, "ORGANIZATION");
  if (!locator) throw new RepositoryError(409, "Organization login 不可用。");
  return { id: command.ownerAccountId, kind: "ORGANIZATION", login: locator.login };
}

async function repositoryResult(
  sql: Sql,
  repositoryId: string,
  ownerLogin: string,
): Promise<RepositoryCreationResult> {
  const row = (
    await sql.query(
      `SELECT id,owner_account_id,owner_account_kind,name,visibility,version
       FROM repositories
       WHERE id=$1`,
      [repositoryId],
    )
  ).rows[0] as
    | {
        id: string;
        owner_account_id: string;
        owner_account_kind: "USER" | "ORGANIZATION";
        name: string;
        visibility: string;
        version: number;
      }
    | undefined;
  if (!row || row.visibility !== "private") {
    throw new RepositoryError(503, "Repository 建立回執無法讀取。");
  }
  return {
    id: row.id,
    ownerAccountId: row.owner_account_id,
    ownerKind: row.owner_account_kind,
    ownerLogin,
    name: row.name,
    visibility: "private",
    version: Number(row.version),
  };
}

export class PostgresRepositoryCreationStore implements RepositoryCreationStore {
  constructor(private db: Database = businessDatabase()) {}

  owners(userId: string): Promise<readonly RepositoryOwnerOption[]> {
    return this.db.transaction(async (sql) => {
      const actor = await readActiveUserQualification(sql, userId, "share");
      if (!actor) throw new RepositoryError(403, "目前 User 資格不能建立 Repository。");
      const personal = await readAccountLogin(sql, userId, "USER");
      if (!personal) throw new RepositoryError(409, "目前 User login 不可用。");

      const organizations: RepositoryOwnerOption[] = [];
      for (const id of await readOrganizationOwnerScopeIds(sql, userId)) {
        if (!(await isOrganizationOwner(sql, id, userId))) continue;
        const locator = await readAccountLogin(sql, id, "ORGANIZATION");
        if (!locator) throw new RepositoryError(409, "Organization login 不可用。");
        organizations.push({ id, kind: "ORGANIZATION", login: locator.login });
      }
      organizations.sort((left, right) => left.login.localeCompare(right.login));
      return [{ id: userId, kind: "USER", login: personal.login }, ...organizations];
    });
  }

  create(
    userId: string,
    command: RepositoryCreateCommand,
    now: number,
  ): Promise<RepositoryCreationResult> {
    const commandFingerprint = fingerprint(command);
    return this.db.transaction(async (sql) => {
      const owner = await currentOwner(sql, userId, command);
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `repository-create:${userId}:${command.requestId}`,
      ]);

      const previous = (
        await sql.query(
          "SELECT fingerprint,result FROM repository_commands WHERE actor=$1 AND request_id=$2",
          [userId, command.requestId],
        )
      ).rows[0] as { fingerprint: string; result: unknown } | undefined;
      if (previous) {
        if (previous.fingerprint !== commandFingerprint) {
          throw new RepositoryError(409, "此 Repository 建立請求編號已用於不同內容。");
        }
        const receipt = previous.result as { receiptVersion?: number; repositoryId?: string };
        if (receipt.receiptVersion !== 1 || typeof receipt.repositoryId !== "string") {
          throw new RepositoryError(503, "Repository 建立回執無法讀取。");
        }
        return repositoryResult(sql, receipt.repositoryId, owner.login);
      }

      const repositoryId = randomUUID();
      try {
        await sql.query("SELECT * FROM app_private.provision_repository($1,$2,$3,$4,$5)", [
          repositoryId,
          userId,
          command.ownerAccountId,
          command.ownerKind,
          command.name,
        ]);
      } catch (error) {
        const postgres = error as { code?: string; constraint?: string };
        if (postgres.code === "23505" && postgres.constraint === "repositories_owner_name") {
          throw new RepositoryError(409, "此 owner 已有相同名稱的 Repository。");
        }
        if (postgres.code === "42501") {
          throw new RepositoryError(403, "目前 owner 資格不能建立 Repository。");
        }
        throw error;
      }

      await sql.query(
        `INSERT INTO repository_commands(actor,request_id,fingerprint,result,at)
         VALUES($1,$2,$3,$4::jsonb,$5)`,
        [
          userId,
          command.requestId,
          commandFingerprint,
          JSON.stringify({ receiptVersion: 1, repositoryId }),
          now,
        ],
      );
      return repositoryResult(sql, repositoryId, owner.login);
    });
  }
}
