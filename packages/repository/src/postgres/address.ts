import { createHash } from "node:crypto";
import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import { readAccountLogin, resolveAccountLogin } from "@line_bot_v1/namespace/postgres";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import type {
  RepositoryAddressCommand,
  RepositoryAddressReceipt,
  RepositoryAddressSnapshot,
  RepositoryAddressStore,
} from "../contracts/repositories/address.js";
import type { RepositorySelector } from "../contracts/selectors.js";
import {
  hasRepositoryPermission,
  type RepositoryAddress,
  RepositoryError,
  type RepositoryPermission,
} from "../domain.js";
import { resolveAuthorizedRepositoryId } from "./access.js";

type RepositoryRow = {
  id: string;
  owner_account_id: string;
  owner_account_kind: "USER" | "ORGANIZATION";
  name: string;
  version: number;
  address: unknown;
};

type Receipt = Readonly<{
  receiptVersion: 1;
  family: "repository-address";
  action: RepositoryAddressCommand["action"];
  result: RepositoryAddressReceipt;
}>;

export type RepositoryAttendanceSite = Readonly<{
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radius: number;
  version: number;
}>;

const fingerprint = (command: RepositoryAddressCommand) =>
  createHash("sha256")
    .update(JSON.stringify({ family: "repository-address", command }))
    .digest("hex");

function addressFromRow(row: RepositoryRow): RepositoryAddress | null {
  if (row.address === null) return null;
  if (!validAddress(row.address)) {
    throw new RepositoryError(503, "Repository 地址資料不完整。");
  }
  return row.address;
}

function sameAddress(left: RepositoryAddress | null, right: RepositoryAddress | null) {
  if (left === null || right === null) return left === right;
  return (
    left.address === right.address &&
    left.latitude === right.latitude &&
    left.longitude === right.longitude &&
    left.radius === right.radius
  );
}

async function repositoryRow(
  sql: Sql,
  selector: RepositorySelector,
  lock = false,
): Promise<RepositoryRow> {
  const columns = "id,owner_account_id,owner_account_kind,name,version,address";
  if ("repositoryId" in selector) {
    const row = (
      await sql.query(
        `SELECT ${columns} FROM repositories WHERE id=$1 ${lock ? "FOR UPDATE" : ""}`,
        [selector.repositoryId],
      )
    ).rows[0] as RepositoryRow | undefined;
    if (!row) throw new RepositoryError(404, "找不到 Repository。");
    return row;
  }
  const owner = await resolveAccountLogin(sql, selector.ownerLogin);
  if (!owner) throw new RepositoryError(404, "找不到 Repository。");
  const row = (
    await sql.query(
      `SELECT ${columns}
       FROM repositories
       WHERE owner_account_id=$1 AND owner_account_kind=$2 AND lower(name)=lower($3)
       ${lock ? "FOR UPDATE" : ""}`,
      [owner.id, owner.kind, selector.repositoryName],
    )
  ).rows[0] as RepositoryRow | undefined;
  if (!row) throw new RepositoryError(404, "找不到 Repository。");
  return row;
}

async function actorPermissions(
  sql: Sql,
  repositoryId: string,
  userId: string,
): Promise<RepositoryPermission[] | null> {
  const row = (
    await sql.query(
      "SELECT permissions FROM repository_effective_access WHERE repository_id=$1 AND user_id=$2",
      [repositoryId, userId],
    )
  ).rows[0] as { permissions: RepositoryPermission[] } | undefined;
  return row?.permissions ?? null;
}

async function requireMember(sql: Sql, repositoryId: string, userId: string) {
  const permissions = await actorPermissions(sql, repositoryId, userId);
  if (!permissions?.length) throw new RepositoryError(403, "目前不是此 Repository 的有效成員。");
  return permissions;
}

async function snapshot(
  sql: Sql,
  repository: RepositoryRow,
  userId: string,
  permissions: readonly RepositoryPermission[],
): Promise<RepositoryAddressSnapshot> {
  const owner = await readAccountLogin(
    sql,
    repository.owner_account_id,
    repository.owner_account_kind,
  );
  if (!owner) throw new RepositoryError(409, "Repository owner locator 不可用。");
  return {
    repository: {
      id: repository.id,
      actorUserId: userId,
      ownerLogin: owner.login,
      name: repository.name,
      version: Number(repository.version),
      actorIsOwner:
        repository.owner_account_kind === "USER" && repository.owner_account_id === userId,
      actorPermissions: permissions,
    },
    address: addressFromRow(repository),
  };
}

function validAddress(value: unknown): value is RepositoryAddress | null {
  if (value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const address = value as Partial<RepositoryAddress>;
  return (
    typeof address.address === "string" &&
    typeof address.latitude === "number" &&
    Number.isFinite(address.latitude) &&
    typeof address.longitude === "number" &&
    Number.isFinite(address.longitude) &&
    typeof address.radius === "number" &&
    Number.isFinite(address.radius)
  );
}

function readReceipt(
  previous: { fingerprint: string; result: unknown } | undefined,
  commandFingerprint: string,
): RepositoryAddressReceipt | null {
  if (!previous) return null;
  if (previous.fingerprint !== commandFingerprint) {
    throw new RepositoryError(409, "此請求編號已用於不同 Repository 操作。");
  }
  const receipt = previous.result as Partial<Receipt>;
  const result = receipt.result as Partial<RepositoryAddressReceipt> | undefined;
  if (
    receipt.receiptVersion !== 1 ||
    receipt.family !== "repository-address" ||
    (receipt.action !== "set" && receipt.action !== "remove") ||
    !result ||
    typeof result.requestId !== "string" ||
    typeof result.repositoryId !== "string" ||
    !validAddress(result.address) ||
    !Number.isSafeInteger(result.version) ||
    !Number.isSafeInteger(result.at)
  ) {
    throw new RepositoryError(503, "Repository 地址回執無法讀取。");
  }
  return result as RepositoryAddressReceipt;
}

export async function repositoryAttendanceSites(
  sql: Sql,
  userId: string,
): Promise<readonly RepositoryAttendanceSite[]> {
  await sql.query("SELECT pg_advisory_xact_lock_shared(71020260912::bigint)");
  const rows = (
    await sql.query(
      `SELECT r.id,r.name,r.address,r.version
       FROM repository_effective_access a
       JOIN repositories r ON r.id=a.repository_id
       WHERE a.user_id=$1 AND r.address IS NOT NULL AND NOT r.is_archived
       ORDER BY r.id`,
      [userId],
    )
  ).rows as Array<{
    id: string;
    name: string;
    address: RepositoryAddress;
    version: number;
  }>;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    ...row.address,
    version: Number(row.version),
  }));
}

export class PostgresRepositoryAddressStore implements RepositoryAddressStore {
  constructor(private readonly db: Database = businessDatabase()) {}

  view(userId: string, selector: RepositorySelector): Promise<RepositoryAddressSnapshot> {
    return this.db.transaction(async (sql) => {
      const actor = await readActiveUserQualification(sql, userId, "share");
      if (!actor) throw new RepositoryError(403, "目前 User 資格不能讀取 Repository 地址。");
      const repositoryId = await resolveAuthorizedRepositoryId(sql, { userId }, selector);
      const repository = await repositoryRow(sql, { repositoryId });
      const permissions = await requireMember(sql, repository.id, userId);
      return snapshot(sql, repository, userId, permissions);
    });
  }

  execute(
    userId: string,
    command: RepositoryAddressCommand,
    now: number,
  ): Promise<RepositoryAddressReceipt> {
    const commandFingerprint = fingerprint(command);
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT pg_advisory_xact_lock(71020260912::bigint)");
      const actor = await readActiveUserQualification(sql, userId, "update");
      if (!actor) throw new RepositoryError(403, "目前 User 資格不能管理 Repository 地址。");
      const repository = await repositoryRow(sql, { repositoryId: command.repositoryId }, true);
      if (!hasRepositoryPermission(await requireMember(sql, repository.id, userId), "admin")) {
        throw new RepositoryError(403, "需要 Repository admin 才能管理地址。");
      }

      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `repository-command:${userId}:${command.requestId}`,
      ]);
      const previous = (
        await sql.query(
          "SELECT fingerprint,result FROM repository_commands WHERE actor=$1 AND request_id=$2",
          [userId, command.requestId],
        )
      ).rows[0] as { fingerprint: string; result: unknown } | undefined;
      const replay = readReceipt(previous, commandFingerprint);
      if (replay) return replay;

      if (Number(repository.version) !== command.expectedVersion) {
        throw new RepositoryError(409, "Repository 地址狀態已變更，請重新載入。");
      }
      const currentAddress = addressFromRow(repository);
      const nextAddress = command.action === "set" ? (command.address ?? null) : null;
      if (sameAddress(currentAddress, nextAddress)) {
        throw new RepositoryError(409, "Repository 地址沒有變更。");
      }

      const changed = (
        await sql.query(
          `UPDATE repositories
           SET address=$2::jsonb,version=version+1
           WHERE id=$1 AND version=$3
           RETURNING version`,
          [
            repository.id,
            nextAddress === null ? null : JSON.stringify(nextAddress),
            command.expectedVersion,
          ],
        )
      ).rows[0] as { version: number } | undefined;
      if (!changed) throw new RepositoryError(409, "Repository 地址狀態已變更，請重新載入。");

      const result: RepositoryAddressReceipt = {
        requestId: command.requestId,
        repositoryId: repository.id,
        address: nextAddress,
        version: Number(changed.version),
        at: now,
      };
      const receipt: Receipt = {
        receiptVersion: 1,
        family: "repository-address",
        action: command.action,
        result,
      };
      await sql.query(
        `INSERT INTO repository_commands(actor,request_id,fingerprint,result,at)
         VALUES($1,$2,$3,$4::jsonb,$5)`,
        [userId, command.requestId, commandFingerprint, JSON.stringify(receipt), now],
      );
      return result;
    });
  }
}
