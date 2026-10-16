import { createHash } from "node:crypto";
import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import type { Database, Sql, SqlRow } from "@line_bot_v1/platform/postgres";
import { literalValue, numericValue } from "@line_bot_v1/platform/validation";
import type {
  RepositorySubscriptionEvidence,
  RepositorySubscriptionPersistence,
  RepositorySubscriptionScope,
  RepositorySubscriptionTransaction,
} from "../../../contracts/output/repository-subscription.js";
import type {
  RepositorySubscriptionDecision,
  RepositorySubscriptionRecord,
} from "../../../domain/repository/entities/repository.js";
import { repositorySubscriptionStates } from "../../../domain/repository/entities/repository.js";
import { authorizedRepository } from "../../../postgres/access.js";
import { decodeCommandRow } from "../../../postgres/decode.js";

const fingerprint = (payload: string) => createHash("sha256").update(payload).digest("hex");

function decodeSubscriptionRow(row: SqlRow): RepositorySubscriptionRecord {
  return {
    state: literalValue(row.state, repositorySubscriptionStates),
    version: Number(numericValue(row.version)),
  };
}

class PostgresRepositorySubscriptionTransaction implements RepositorySubscriptionTransaction {
  constructor(private readonly sql: Sql) {}

  async hasCurrentUpdateQualification(userId: string): Promise<boolean> {
    return Boolean(await readActiveUserQualification(this.sql, userId, "update"));
  }

  async authorizedRepository(
    userId: string,
    repositoryId: string,
  ): Promise<RepositorySubscriptionScope> {
    const repository = await authorizedRepository(this.sql, { userId }, { repositoryId });
    return { id: repository.id };
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
  ): Promise<RepositorySubscriptionEvidence | null> {
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

  async lockPair(repositoryId: string, userId: string): Promise<void> {
    await this.sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `repository-subscription:${repositoryId}:${userId}`,
    ]);
  }

  async currentForUpdate(
    repositoryId: string,
    userId: string,
  ): Promise<RepositorySubscriptionRecord | null> {
    return (
      (
        await this.sql.query(
          `SELECT state,version
           FROM repository_subscriptions
           WHERE repository_id=$1 AND user_id=$2
           FOR UPDATE`,
          [repositoryId, userId],
          decodeSubscriptionRow,
        )
      ).rows[0] ?? null
    );
  }

  async save(
    repositoryId: string,
    userId: string,
    decision: RepositorySubscriptionDecision,
    now: number,
  ): Promise<boolean> {
    const changed = decision.previous
      ? (
          await this.sql.query(
            `UPDATE repository_subscriptions
             SET state=$3,version=$4,updated_at=$5
             WHERE repository_id=$1 AND user_id=$2 AND version=$6
             RETURNING state`,
            [
              repositoryId,
              userId,
              decision.current.state,
              decision.current.version,
              now,
              decision.previous.version,
            ],
          )
        ).rows[0]
      : (
          await this.sql.query(
            `INSERT INTO repository_subscriptions(
               repository_id,user_id,state,version,updated_at
             ) VALUES($1,$2,$3,$4,$5)
             RETURNING state`,
            [repositoryId, userId, decision.current.state, decision.current.version, now],
          )
        ).rows[0];
    return Boolean(changed);
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

export class PostgresRepositorySubscriptionPersistence
  implements RepositorySubscriptionPersistence
{
  constructor(private readonly db: Database) {}

  transact<T>(work: (transaction: RepositorySubscriptionTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT app_private.lock_governance('shared')");
      return work(new PostgresRepositorySubscriptionTransaction(sql));
    });
  }
}
