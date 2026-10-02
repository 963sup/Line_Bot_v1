import { createHash, randomUUID } from "node:crypto";
import {
  hasOrganizationOwnerAssignment,
  readOrganizationQualification,
} from "@line_bot_v1/organization/postgres";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import type {
  IssueTypeCommand,
  IssueTypeDefinition,
  IssueTypeIdentity,
  IssueTypeList,
  IssueTypeReceipt,
  IssueTypeStore,
} from "../../contracts/issue-types.js";
import { IssueError } from "../../domain.js";

type IssueTypeRow = {
  id: string;
  organization_account_id: string;
  name: string;
  description: string | null;
  color: IssueTypeDefinition["color"];
  is_enabled: boolean;
  deleted_at: number | string | null;
  version: number | string;
  created_at: number | string;
  updated_at: number | string;
};

type StoredReceipt = Readonly<{
  receiptVersion: 1;
  family: "issue-type-management";
  result: IssueTypeReceipt;
}>;

function definition(row: IssueTypeRow): IssueTypeDefinition {
  return {
    id: row.id,
    organizationAccountId: row.organization_account_id,
    name: row.name,
    description: row.description,
    color: row.color,
    isEnabled: row.is_enabled,
    deletedAt: row.deleted_at === null ? null : Number(row.deleted_at),
    version: Number(row.version),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

const fingerprint = (command: IssueTypeCommand) =>
  createHash("sha256")
    .update(JSON.stringify({ family: "issue-type-management", command }))
    .digest("hex");

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readReceipt(
  previous: { fingerprint: string; result: unknown } | undefined,
  expectedFingerprint: string,
): IssueTypeReceipt | null {
  if (!previous) return null;
  if (previous.fingerprint !== expectedFingerprint) {
    throw new IssueError(409, "此請求編號已用於不同 Issue 操作。");
  }
  if (!record(previous.result)) throw new IssueError(503, "IssueType 回執無法讀取。");
  const envelope = previous.result as Partial<StoredReceipt>;
  const result = envelope.result;
  if (
    envelope.receiptVersion !== 1 ||
    envelope.family !== "issue-type-management" ||
    !record(result) ||
    typeof result.requestId !== "string" ||
    typeof result.organizationAccountId !== "string" ||
    typeof result.issueTypeId !== "string" ||
    typeof result.action !== "string" ||
    !Number.isSafeInteger(result.version) ||
    !Number.isSafeInteger(result.at)
  ) {
    throw new IssueError(503, "IssueType 回執無法讀取。");
  }
  return result as IssueTypeReceipt;
}

function storedReceipt(result: IssueTypeReceipt): StoredReceipt {
  return { receiptVersion: 1, family: "issue-type-management", result };
}

async function requireOrganizationOwner(
  sql: Sql,
  identity: IssueTypeIdentity,
  organizationAccountId: string,
  lock: "none" | "share" = "none",
) {
  const organization = await readOrganizationQualification(sql, organizationAccountId, lock);
  if (!organization) throw new IssueError(404, "找不到 Organization。");
  if (organization.status !== "active") {
    throw new IssueError(409, "停用的 Organization 不能管理 IssueType。");
  }
  if (!(await hasOrganizationOwnerAssignment(sql, organizationAccountId, identity.userId))) {
    throw new IssueError(403, "只有 current OrganizationOwner 可以管理 IssueType。");
  }
}

function postgresConflict(error: unknown): never {
  const postgres = error as { code?: string };
  if (postgres.code === "23505") {
    throw new IssueError(409, "此 Organization 已有相同名稱的 IssueType。");
  }
  if (postgres.code === "23503" || postgres.code === "23514") {
    throw new IssueError(409, "IssueType 關係或狀態不合法。");
  }
  throw error;
}

async function currentType(
  sql: Sql,
  organizationAccountId: string,
  issueTypeId: string,
): Promise<IssueTypeRow> {
  const row = (
    await sql.query(
      `SELECT * FROM issue_types
       WHERE organization_account_id=$1 AND id=$2
       FOR UPDATE`,
      [organizationAccountId, issueTypeId],
    )
  ).rows[0] as IssueTypeRow | undefined;
  if (!row) throw new IssueError(404, "找不到 IssueType。");
  if (row.deleted_at !== null) throw new IssueError(409, "IssueType 已刪除。");
  return row;
}

export class PostgresIssueTypeStore implements IssueTypeStore {
  constructor(private readonly db: Database = businessDatabase()) {}

  list(identity: IssueTypeIdentity, organizationAccountId: string): Promise<IssueTypeList> {
    return this.db.transaction(async (sql) => {
      await requireOrganizationOwner(sql, identity, organizationAccountId);
      const rows = (
        await sql.query(
          `SELECT * FROM issue_types
           WHERE organization_account_id=$1 AND deleted_at IS NULL
           ORDER BY lower(name),id`,
          [organizationAccountId],
        )
      ).rows as IssueTypeRow[];
      return { organizationAccountId, items: rows.map(definition) };
    });
  }

  execute(
    identity: IssueTypeIdentity,
    command: IssueTypeCommand,
    now: number,
  ): Promise<IssueTypeReceipt> {
    const commandFingerprint = fingerprint(command);
    return this.db.transaction(async (sql) => {
      await requireOrganizationOwner(sql, identity, command.organizationAccountId, "share");
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `issue:${identity.userId}:${command.requestId}`,
      ]);
      const previous = (
        await sql.query(
          "SELECT fingerprint,result FROM issue_commands WHERE actor=$1 AND request_id=$2",
          [identity.userId, command.requestId],
        )
      ).rows[0] as { fingerprint: string; result: unknown } | undefined;
      const replay = readReceipt(previous, commandFingerprint);
      if (replay) return replay;

      let row: IssueTypeRow;
      let data: Record<string, unknown>;

      if (command.action === "create-issue-type") {
        const issueTypeId = randomUUID();
        try {
          row = (
            await sql.query(
              `INSERT INTO issue_types(
                 id,organization_account_id,name,description,color,is_enabled,deleted_at,
                 version,created_at,updated_at
               ) VALUES($1,$2,$3,$4,$5,$6,NULL,1,$7,$7)
               RETURNING *`,
              [
                issueTypeId,
                command.organizationAccountId,
                command.name,
                command.description,
                command.color,
                command.isEnabled,
                now,
              ],
            )
          ).rows[0] as IssueTypeRow;
        } catch (error) {
          postgresConflict(error);
        }
        data = { issueType: definition(row!) };
      } else {
        const before = await currentType(sql, command.organizationAccountId, command.issueTypeId);
        if (Number(before.version) !== command.expectedVersion) {
          throw new IssueError(409, "IssueType 已更新，請重新讀取後再操作。");
        }

        if (command.action === "update-issue-type") {
          const name = command.name ?? before.name;
          const description =
            command.description === undefined ? before.description : command.description;
          const color = command.color ?? before.color;
          const isEnabled = command.isEnabled ?? before.is_enabled;
          if (
            name === before.name &&
            description === before.description &&
            color === before.color &&
            isEnabled === before.is_enabled
          ) {
            throw new IssueError(409, "IssueType 沒有變更。");
          }
          try {
            row = (
              await sql.query(
                `UPDATE issue_types
                 SET name=$3,description=$4,color=$5,is_enabled=$6,
                     version=version+1,updated_at=$7
                 WHERE organization_account_id=$1 AND id=$2 AND version=$8
                 RETURNING *`,
                [
                  command.organizationAccountId,
                  command.issueTypeId,
                  name,
                  description,
                  color,
                  isEnabled,
                  now,
                  command.expectedVersion,
                ],
              )
            ).rows[0] as IssueTypeRow;
          } catch (error) {
            postgresConflict(error);
          }
          data = { before: definition(before), after: definition(row!) };
        } else {
          const assigned = (
            await sql.query(
              "SELECT 1 FROM issue_type_assignments WHERE issue_type_id=$1 LIMIT 1",
              [before.id],
            )
          ).rows[0];
          if (assigned) {
            throw new IssueError(409, "IssueType 仍被 Issue 使用，請先清除關係。");
          }
          row = (
            await sql.query(
              `UPDATE issue_types
               SET is_enabled=false,deleted_at=$3,version=version+1,updated_at=$3
               WHERE organization_account_id=$1 AND id=$2 AND version=$4
               RETURNING *`,
              [
                command.organizationAccountId,
                command.issueTypeId,
                now,
                command.expectedVersion,
              ],
            )
          ).rows[0] as IssueTypeRow;
          data = { before: definition(before), after: definition(row) };
        }
      }

      const current = definition(row!);
      await sql.query(
        `INSERT INTO issue_type_events(issue_type_id,version,actor,action,data,at)
         VALUES($1,$2,$3,$4,$5::jsonb,$6)`,
        [
          current.id,
          current.version,
          identity.userId,
          command.action,
          JSON.stringify(data),
          now,
        ],
      );
      const result: IssueTypeReceipt = {
        requestId: command.requestId,
        organizationAccountId: command.organizationAccountId,
        issueTypeId: current.id,
        action: command.action,
        version: current.version,
        at: now,
        data,
      };
      await sql.query(
        `INSERT INTO issue_commands(actor,request_id,fingerprint,result)
         VALUES($1,$2,$3,$4::jsonb)`,
        [
          identity.userId,
          command.requestId,
          commandFingerprint,
          JSON.stringify(storedReceipt(result)),
        ],
      );
      return result;
    });
  }
}
