import { createHash } from "node:crypto";
import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import { businessDatabase, type Database, type SqlRow } from "@line_bot_v1/platform/postgres";
import { isRecord, literalValue, numericValue } from "@line_bot_v1/platform/validation";
import type {
  RepositorySubscriptionCommand,
  RepositorySubscriptionReceipt,
  RepositorySubscriptionSnapshot,
  RepositorySubscriptionState,
  RepositorySubscriptionStore,
} from "../contracts/repositories/subscription.js";
import type { RepositorySelector } from "../contracts/selectors.js";
import { RepositoryError } from "../domain.js";
import { authorizedRepository } from "./access.js";
import { decodeCommandRow } from "./decode.js";

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

function decodeSubscriptionRow(row: SqlRow): {
  state: RepositorySubscriptionState;
  version: number;
} {
  return {
    state: literalValue(row.state, ["SUBSCRIBED", "UNSUBSCRIBED", "IGNORED"]),
    version: Number(numericValue(row.version)),
  };
}

function readReceipt(
  previous: { fingerprint: string; result: unknown } | undefined,
  commandFingerprint: string,
): RepositorySubscriptionReceipt | null {
  if (!previous) return null;
  if (previous.fingerprint !== commandFingerprint) {
    throw new RepositoryError(409, "此請求編號已用於不同 Repository 操作。");
  }
  if (!isRecord(previous.result)) {
    throw new RepositoryError(503, "Repository subscription 回執無法讀取。");
  }
  const receipt = previous.result;
  if (!isRecord(receipt.result)) {
    throw new RepositoryError(503, "Repository subscription 回執無法讀取。");
  }
  const result = receipt.result;
  if (
    receipt.receiptVersion !== 1 ||
    receipt.family !== "repository-subscription" ||
    receipt.action !== "set" ||
    typeof result.requestId !== "string" ||
    typeof result.repositoryId !== "string" ||
    !validState(result.state) ||
    typeof result.version !== "number" ||
    !Number.isSafeInteger(result.version) ||
    typeof result.at !== "number" ||
    !Number.isSafeInteger(result.at)
  ) {
    throw new RepositoryError(503, "Repository subscription 回執無法讀取。");
  }
  return {
    requestId: result.requestId,
    repositoryId: result.repositoryId,
    state: result.state,
    version: result.version,
    at: result.at,
  };
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
          decodeSubscriptionRow,
        )
      ).rows[0];
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
          decodeCommandRow,
        )
      ).rows[0];
      const replay = readReceipt(previous, commandFingerprint);
      if (replay) return replay;

      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `repository-subscription:${repository.id}:${userId}`,
      ]);

      const current = (
        await sql.query(
          `SELECT state,version
           FROM repository_subscriptions
           WHERE repository_id=$1 AND user_id=$2
           FOR UPDATE`,
          [repository.id, userId],
          decodeSubscriptionRow,
        )
      ).rows[0];
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
              decodeSubscriptionRow,
            )
          ).rows[0]
        : (
            await sql.query(
              `INSERT INTO repository_subscriptions(
                 repository_id,user_id,state,version,updated_at
               ) VALUES($1,$2,$3,1,$4)
               RETURNING state,version`,
              [repository.id, userId, command.state, now],
              decodeSubscriptionRow,
            )
          ).rows[0];
      if (!changed) {
        throw new RepositoryError(409, "Repository subscription 已更新，請重新載入。");
      }

      const result: RepositorySubscriptionReceipt = {
        requestId: command.requestId,
        repositoryId: repository.id,
        state: changed.state,
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
