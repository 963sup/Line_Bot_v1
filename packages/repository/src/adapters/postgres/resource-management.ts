import { createHash, randomUUID } from "node:crypto";
import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import type {
  RepositoryResourceManagementCommand,
  RepositoryResourceManagementReceipt,
  RepositoryResourceManagementStore,
} from "../../contracts/output/resource-management.js";
import type {
  RepositoryLabel,
  RepositoryMilestone,
  RepositoryMilestoneStatus,
} from "../../contracts/dto/resources.js";
import {
  hasRepositoryPermission,
  RepositoryError,
  type RepositoryPermission,
} from "../../domain.js";

type RepositoryRow = {
  id: string;
  is_archived: boolean;
};

type LabelRow = {
  id: string;
  repository_id: string;
  name: string;
  color: string;
  description: string;
  version: number | string;
};

type MilestoneRow = {
  id: string;
  repository_id: string;
  number: number | string;
  title: string;
  description: string;
  status: RepositoryMilestoneStatus;
  due_at: number | string | null;
  version: number | string;
  created_at: number | string;
  updated_at: number | string;
};

type StoredReceipt = {
  receiptVersion: 1;
  family: "repository-resource-management";
  result: RepositoryResourceManagementReceipt;
};

const fingerprint = (command: RepositoryResourceManagementCommand) =>
  createHash("sha256")
    .update(JSON.stringify({ family: "repository-resource-management", command }))
    .digest("hex");

function label(row: LabelRow): RepositoryLabel {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    name: row.name,
    color: row.color,
    description: row.description,
    version: Number(row.version),
  };
}

function milestone(row: MilestoneRow): RepositoryMilestone {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    number: Number(row.number),
    title: row.title,
    description: row.description,
    status: row.status,
    dueAt: row.due_at === null ? null : Number(row.due_at),
    version: Number(row.version),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validLabel(value: unknown): value is RepositoryLabel {
  return (
    record(value) &&
    typeof value.id === "string" &&
    typeof value.repositoryId === "string" &&
    typeof value.name === "string" &&
    typeof value.color === "string" &&
    typeof value.description === "string" &&
    Number.isSafeInteger(value.version) &&
    Number(value.version) > 0
  );
}

function validMilestone(value: unknown): value is RepositoryMilestone {
  return (
    record(value) &&
    typeof value.id === "string" &&
    typeof value.repositoryId === "string" &&
    Number.isSafeInteger(value.number) &&
    Number(value.number) > 0 &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    (value.status === "open" || value.status === "closed") &&
    (value.dueAt === null || (Number.isSafeInteger(value.dueAt) && Number(value.dueAt) >= 0)) &&
    Number.isSafeInteger(value.version) &&
    Number(value.version) > 0 &&
    Number.isSafeInteger(value.createdAt) &&
    Number.isSafeInteger(value.updatedAt)
  );
}

function readReceipt(
  previous: { fingerprint: string; result: unknown } | undefined,
  commandFingerprint: string,
): RepositoryResourceManagementReceipt | null {
  if (!previous) return null;
  if (previous.fingerprint !== commandFingerprint) {
    throw new RepositoryError(409, "此請求編號已用於不同 Repository resource 操作。");
  }
  if (!record(previous.result)) {
    throw new RepositoryError(503, "Repository resource 回執無法讀取。");
  }
  const envelope = previous.result as Partial<StoredReceipt>;
  const result = envelope.result;
  if (
    envelope.receiptVersion !== 1 ||
    envelope.family !== "repository-resource-management" ||
    !record(result) ||
    typeof result.requestId !== "string" ||
    typeof result.repositoryId !== "string" ||
    typeof result.action !== "string" ||
    !Number.isSafeInteger(result.at)
  ) {
    throw new RepositoryError(503, "Repository resource 回執無法讀取。");
  }
  if (result.action === "create-label" || result.action === "update-label") {
    if (!validLabel(result.label) || result.deleted !== false) {
      throw new RepositoryError(503, "Repository resource 回執無法讀取。");
    }
    return result as RepositoryResourceManagementReceipt;
  }
  if (result.action === "delete-label") {
    if (!validLabel(result.label) || result.deleted !== true) {
      throw new RepositoryError(503, "Repository resource 回執無法讀取。");
    }
    return result as RepositoryResourceManagementReceipt;
  }
  if (
    result.action === "create-milestone" ||
    result.action === "update-milestone" ||
    result.action === "open-milestone" ||
    result.action === "close-milestone"
  ) {
    if (!validMilestone(result.milestone)) {
      throw new RepositoryError(503, "Repository resource 回執無法讀取。");
    }
    return result as RepositoryResourceManagementReceipt;
  }
  throw new RepositoryError(503, "Repository resource 回執無法讀取。");
}

async function currentRepository(sql: Sql, repositoryId: string): Promise<RepositoryRow> {
  const row = (
    await sql.query("SELECT id,is_archived FROM repositories WHERE id=$1 FOR UPDATE", [
      repositoryId,
    ])
  ).rows[0] as RepositoryRow | undefined;
  if (!row) throw new RepositoryError(404, "找不到 Repository。");
  return row;
}

async function requireDefinitionWriter(sql: Sql, repositoryId: string, userId: string) {
  const permissions =
    (
      await sql.query(
        "SELECT permissions FROM repository_effective_access WHERE repository_id=$1 AND user_id=$2",
        [repositoryId, userId],
      )
    ).rows[0]?.permissions ?? [];
  const typed = permissions as RepositoryPermission[];
  if (
    !hasRepositoryPermission(typed, "write") &&
    !hasRepositoryPermission(typed, "maintain") &&
    !hasRepositoryPermission(typed, "admin")
  ) {
    throw new RepositoryError(
      403,
      "需要 Repository write、maintain 或 admin 才能管理 Label/Milestone 定義。",
    );
  }
}

async function currentLabel(sql: Sql, repositoryId: string, labelId: string): Promise<LabelRow> {
  const row = (
    await sql.query("SELECT * FROM repository_labels WHERE repository_id=$1 AND id=$2 FOR UPDATE", [
      repositoryId,
      labelId,
    ])
  ).rows[0] as LabelRow | undefined;
  if (!row) throw new RepositoryError(404, "找不到 Label。");
  return row;
}

async function currentMilestone(
  sql: Sql,
  repositoryId: string,
  milestoneId: string,
): Promise<MilestoneRow> {
  const row = (
    await sql.query(
      "SELECT * FROM repository_milestones WHERE repository_id=$1 AND id=$2 FOR UPDATE",
      [repositoryId, milestoneId],
    )
  ).rows[0] as MilestoneRow | undefined;
  if (!row) throw new RepositoryError(404, "找不到 Milestone。");
  return row;
}

function requireVersion(actual: number | string, expected: number) {
  if (Number(actual) !== expected) {
    throw new RepositoryError(409, "Repository resource 已更新，請重新讀取後再操作。");
  }
}

async function event(
  sql: Sql,
  repositoryId: string,
  userId: string,
  action: RepositoryResourceManagementCommand["action"],
  previous: object,
  current: object,
  now: number,
) {
  await sql.query(
    `INSERT INTO repository_events(
       repository_id,actor_user_id,action,previous_state,current_state,at
     ) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)`,
    [repositoryId, userId, action, JSON.stringify(previous), JSON.stringify(current), now],
  );
}

async function storeReceipt(
  sql: Sql,
  userId: string,
  command: RepositoryResourceManagementCommand,
  commandFingerprint: string,
  result: RepositoryResourceManagementReceipt,
  now: number,
) {
  const receipt: StoredReceipt = {
    receiptVersion: 1,
    family: "repository-resource-management",
    result,
  };
  await sql.query(
    `INSERT INTO repository_commands(actor,request_id,fingerprint,result,at)
     VALUES($1,$2,$3,$4::jsonb,$5)`,
    [userId, command.requestId, commandFingerprint, JSON.stringify(receipt), now],
  );
}

function labelConflict(error: unknown): never {
  const postgres = error as { code?: string; constraint?: string };
  if (postgres.code === "23505") {
    throw new RepositoryError(409, "此 Repository 已有相同名稱的 Label。");
  }
  if (postgres.code === "23503") {
    throw new RepositoryError(409, "此 Label 仍被 Issue 引用，無法移除。");
  }
  throw error;
}

export class PostgresRepositoryResourceManagementStore
  implements RepositoryResourceManagementStore
{
  constructor(private readonly db: Database = businessDatabase()) {}

  execute(
    userId: string,
    command: RepositoryResourceManagementCommand,
    now: number,
  ): Promise<RepositoryResourceManagementReceipt> {
    const commandFingerprint = fingerprint(command);
    return this.db.transaction(async (sql) => {
      const actor = await readActiveUserQualification(sql, userId, "update");
      if (!actor) {
        throw new RepositoryError(403, "目前 User 資格不能管理 Repository resource。");
      }

      const repository = await currentRepository(sql, command.repositoryId);
      await requireDefinitionWriter(sql, repository.id, userId);

      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `repository-command:${userId}:${command.requestId}`,
      ]);
      const previousReceipt = (
        await sql.query(
          "SELECT fingerprint,result FROM repository_commands WHERE actor=$1 AND request_id=$2",
          [userId, command.requestId],
        )
      ).rows[0] as { fingerprint: string; result: unknown } | undefined;
      const replay = readReceipt(previousReceipt, commandFingerprint);
      if (replay) return replay;

      if (repository.is_archived) {
        throw new RepositoryError(409, "Repository 已封存，不能修改 Label/Milestone 定義。");
      }

      let result: RepositoryResourceManagementReceipt;

      if (command.action === "create-label") {
        let created: LabelRow;
        try {
          created = (
            await sql.query(
              `INSERT INTO repository_labels(
                 id,repository_id,name,color,description,version
               ) VALUES($1,$2,$3,$4,$5,1)
               RETURNING *`,
              [randomUUID(), repository.id, command.name, command.color, command.description],
            )
          ).rows[0] as LabelRow;
        } catch (error) {
          labelConflict(error);
        }
        const value = label(created!);
        await event(sql, repository.id, userId, command.action, {}, value, now);
        result = {
          requestId: command.requestId,
          repositoryId: repository.id,
          action: command.action,
          label: value,
          deleted: false,
          at: now,
        };
      } else if (command.action === "update-label") {
        const before = await currentLabel(sql, repository.id, command.labelId);
        requireVersion(before.version, command.expectedVersion);
        const nextName = command.name ?? before.name;
        const nextColor = command.color ?? before.color;
        const nextDescription = command.description ?? before.description;
        if (
          nextName === before.name &&
          nextColor === before.color &&
          nextDescription === before.description
        ) {
          throw new RepositoryError(409, "Label 定義沒有變更。");
        }
        let updated: LabelRow;
        try {
          updated = (
            await sql.query(
              `UPDATE repository_labels
               SET name=$3,color=$4,description=$5,version=version+1
               WHERE repository_id=$1 AND id=$2 AND version=$6
               RETURNING *`,
              [
                repository.id,
                command.labelId,
                nextName,
                nextColor,
                nextDescription,
                command.expectedVersion,
              ],
            )
          ).rows[0] as LabelRow;
        } catch (error) {
          labelConflict(error);
        }
        if (!updated!) throw new RepositoryError(409, "Label 已更新，請重新讀取後再操作。");
        const previous = label(before);
        const value = label(updated);
        await event(sql, repository.id, userId, command.action, previous, value, now);
        result = {
          requestId: command.requestId,
          repositoryId: repository.id,
          action: command.action,
          label: value,
          deleted: false,
          at: now,
        };
      } else if (command.action === "delete-label") {
        const before = await currentLabel(sql, repository.id, command.labelId);
        requireVersion(before.version, command.expectedVersion);
        try {
          const deleted = (
            await sql.query(
              `DELETE FROM repository_labels
               WHERE repository_id=$1 AND id=$2 AND version=$3
               RETURNING *`,
              [repository.id, command.labelId, command.expectedVersion],
            )
          ).rows[0] as LabelRow | undefined;
          if (!deleted) throw new RepositoryError(409, "Label 已更新，請重新讀取後再操作。");
        } catch (error) {
          if (error instanceof RepositoryError) throw error;
          labelConflict(error);
        }
        const value = label(before);
        await event(sql, repository.id, userId, command.action, value, {}, now);
        result = {
          requestId: command.requestId,
          repositoryId: repository.id,
          action: command.action,
          label: value,
          deleted: true,
          at: now,
        };
      } else if (command.action === "create-milestone") {
        const numberRow = (
          await sql.query(
            "SELECT COALESCE(MAX(number),0)+1 AS number FROM repository_milestones WHERE repository_id=$1",
            [repository.id],
          )
        ).rows[0] as { number: number | string };
        const created = (
          await sql.query(
            `INSERT INTO repository_milestones(
               id,repository_id,number,title,description,status,due_at,version,created_at,updated_at
             ) VALUES($1,$2,$3,$4,$5,'open',$6,1,$7,$7)
             RETURNING *`,
            [
              randomUUID(),
              repository.id,
              Number(numberRow.number),
              command.title,
              command.description,
              command.dueAt,
              now,
            ],
          )
        ).rows[0] as MilestoneRow;
        const value = milestone(created);
        await event(sql, repository.id, userId, command.action, {}, value, now);
        result = {
          requestId: command.requestId,
          repositoryId: repository.id,
          action: command.action,
          milestone: value,
          at: now,
        };
      } else {
        const before = await currentMilestone(sql, repository.id, command.milestoneId);
        requireVersion(before.version, command.expectedVersion);

        if (command.action === "update-milestone") {
          const nextTitle = command.title ?? before.title;
          const nextDescription = command.description ?? before.description;
          const nextDueAt = command.dueAt === undefined ? before.due_at : command.dueAt;
          const comparableDueAt = nextDueAt === null ? null : Number(nextDueAt);
          const previousDueAt = before.due_at === null ? null : Number(before.due_at);
          if (
            nextTitle === before.title &&
            nextDescription === before.description &&
            comparableDueAt === previousDueAt
          ) {
            throw new RepositoryError(409, "Milestone 定義沒有變更。");
          }
          const updated = (
            await sql.query(
              `UPDATE repository_milestones
               SET title=$3,description=$4,due_at=$5,version=version+1,updated_at=$6
               WHERE repository_id=$1 AND id=$2 AND version=$7
               RETURNING *`,
              [
                repository.id,
                command.milestoneId,
                nextTitle,
                nextDescription,
                comparableDueAt,
                now,
                command.expectedVersion,
              ],
            )
          ).rows[0] as MilestoneRow | undefined;
          if (!updated) {
            throw new RepositoryError(409, "Milestone 已更新，請重新讀取後再操作。");
          }
          const previous = milestone(before);
          const value = milestone(updated);
          await event(sql, repository.id, userId, command.action, previous, value, now);
          result = {
            requestId: command.requestId,
            repositoryId: repository.id,
            action: command.action,
            milestone: value,
            at: now,
          };
        } else {
          const status: RepositoryMilestoneStatus =
            command.action === "open-milestone" ? "open" : "closed";
          if (before.status === status) {
            throw new RepositoryError(
              409,
              status === "open" ? "Milestone 已開啟。" : "Milestone 已關閉。",
            );
          }
          const updated = (
            await sql.query(
              `UPDATE repository_milestones
               SET status=$3,version=version+1,updated_at=$4
               WHERE repository_id=$1 AND id=$2 AND version=$5
               RETURNING *`,
              [repository.id, command.milestoneId, status, now, command.expectedVersion],
            )
          ).rows[0] as MilestoneRow | undefined;
          if (!updated) {
            throw new RepositoryError(409, "Milestone 已更新，請重新讀取後再操作。");
          }
          const previous = milestone(before);
          const value = milestone(updated);
          await event(sql, repository.id, userId, command.action, previous, value, now);
          result = {
            requestId: command.requestId,
            repositoryId: repository.id,
            action: command.action,
            milestone: value,
            at: now,
          };
        }
      }

      await storeReceipt(sql, userId, command, commandFingerprint, result, now);
      return result;
    });
  }
}
