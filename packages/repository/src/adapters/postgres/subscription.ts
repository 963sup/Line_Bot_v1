import { createHash } from "node:crypto";
import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import type {
  RepositorySubscriptionCommand,
  RepositorySubscriptionReceipt,
  RepositorySubscriptionSnapshot,
  RepositorySubscriptionState,
  RepositorySubscriptionStore,
} from "../../application/ports/subscription.js";
import type { RepositorySelector } from "../../contracts/selectors.js";
import { RepositoryError } from "../../domain.js";
import { authorizedRepository } from "./access.js";

type Receipt = Readonly<{
  receiptVersion: 1;
  family: "repository-subscription";
  action: "set";
  result: RepositorySubscriptionReceipt;
}>;

const fingerprint = (command: RepositorySubscriptionCommand) =>
  createHash("sha256")
    .update(JSON.stringify({ family: "repository-subscription", command }))
    .digest("hex");

function validState(value: unknown): value is RepositorySubscriptionState {
  return value === "SUBSCRIBED" || value === "UNSUBSCRIBED" || value === "IGNORED";
}

function readReceipt(
  previous: { fingerprint: string; result: unknown } | undefined,
  commandFingerprint: string,
): RepositorySubscriptionReceipt | null {
  if (!previous) return null;
  if (previous.fingerprint !== commandFingerprint) {
    throw new RepositoryError(409, "此請求編號已用於不同 Repository 操作。");
  }
  const receipt = previous.result as Partial<Receipt>;
  const result = receipt.result as Partial<RepositorySubscriptionReceipt> | undefined;
  if (
    receipt.receiptVersion !== 1 ||
    receipt.family !== "repository-subscription" ||
    receipt.action !== "set" ||
    !result ||
    typeof result.requestId !== "string" ||
    typeof result.repositoryId !== "string" ||
    !validState(result.state) ||
    !Number.isSafeInteger(result.version) ||
    !Number.isSafeInteger(result.at)
  ) {
    throw new RepositoryError(503, "Repository subscription 回執無法讀取。");
  }
  return result as RepositorySubscriptionReceipt;
}

export class PostgresRepositorySubscriptionStore implements RepositorySubscriptionStore {
  constructor(private readonly db: Database = businessDatabase()) {}

  view(userId: string, selector: RepositorySelector): Promise<RepositorySubscriptionSnapshot> {
    return this.db.transaction(async (sql) => {
      const actor = await readActiveUserQualification(sql, userId, "share");
      if (!actor) {
        throw new RepositoryError(403, "目前 User 資格不能讀取 Repository subscription。");
      }
      const repository = await authorizedRepository(sql, { userId }, selector);
      const row = (
        await sql.query(
          `SELECT state,version
           FROM repository_subscriptions
           WHERE repository_id=$1 AND user_id=$2`,
          [repository.id, userId],
        )
      ).rows[0] as { state: RepositorySubscriptionState; version: number } | undefined;
      return {
        repository: {
          id: repository.id,
          actorUserId: userId,
          ownerLogin: repository.ownerLogin,
          name: repository.name,
        },
        state: row?.state ?? "UNSUBSCRIBED",
        version: row ? Number(row.version) : 0,
      };
    });
  }

  execute(
    userId: string,
    command: RepositorySubscriptionCommand,
    now: number,
  ): Promise<RepositorySubscriptionReceipt> {
    const commandFingerprint = fingerprint(command);
    return this.db.transaction(async (sql) => {
      const actor = await readActiveUserQualification(sql, userId, "update");
      if (!actor) {
        throw new RepositoryError(403, "目前 User 資格不能管理 Repository subscription。");
      }
      const repository = await authorizedRepository(
        sql,
        { userId },
        { repositoryId: command.repositoryId },
      );

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

      const current = (
        await sql.query(
          `SELECT state,version
           FROM repository_subscriptions
           WHERE repository_id=$1 AND user_id=$2
           FOR UPDATE`,
          [repository.id, userId],
        )
      ).rows[0] as { state: RepositorySubscriptionState; version: number } | undefined;
      const currentVersion = current ? Number(current.version) : 0;
      if (currentVersion !== command.expectedVersion) {
        throw new RepositoryError(409, "Repository subscription 已更新，請重新載入。");
      }
      if (current && current.state === command.state) {
        throw new RepositoryError(409, "Repository subscription 沒有變更。");
      }

      const changed = current
        ? (
            await sql.query(
              `UPDATE repository_subscriptions
               SET state=$3,version=version+1,updated_at=$4
               WHERE repository_id=$1 AND user_id=$2 AND version=$5
               RETURNING state,version`,
              [repository.id, userId, command.state, now, command.expectedVersion],
            )
          ).rows[0]
        : (
            await sql.query(
              `INSERT INTO repository_subscriptions(
                 repository_id,user_id,state,version,updated_at
               ) VALUES($1,$2,$3,1,$4)
               RETURNING state,version`,
              [repository.id, userId, command.state, now],
            )
          ).rows[0];
      if (!changed) {
        throw new RepositoryError(409, "Repository subscription 已更新，請重新載入。");
      }

      const result: RepositorySubscriptionReceipt = {
        requestId: command.requestId,
        repositoryId: repository.id,
        state: changed.state as RepositorySubscriptionState,
        version: Number(changed.version),
        at: now,
      };
      const receipt: Receipt = {
        receiptVersion: 1,
        family: "repository-subscription",
        action: "set",
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
