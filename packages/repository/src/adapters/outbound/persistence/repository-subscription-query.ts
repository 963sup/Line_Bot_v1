import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import type { Database, SqlRow } from "@line_bot_v1/platform/postgres";
import { literalValue, numericValue } from "@line_bot_v1/platform/validation";
import type {
  RepositorySubscriptionSnapshot,
  RepositorySubscriptionState,
} from "../../../contracts/input/repository-subscription.js";
import { RepositoryError } from "../../../contracts/repository.js";
import type { RepositorySelector } from "../../../contracts/selectors.js";
import { repositorySubscriptionStates } from "../../../domain/repository/entities/repository.js";
import { authorizedRepository } from "../../../postgres/access.js";

function decodeSubscriptionRow(row: SqlRow): {
  state: RepositorySubscriptionState;
  version: number;
} {
  return {
    state: literalValue(row.state, repositorySubscriptionStates),
    version: Number(numericValue(row.version)),
  };
}

export class PostgresRepositorySubscriptionQuery {
  constructor(private readonly db: Database) {}

  view(userId: string, selector: RepositorySelector): Promise<RepositorySubscriptionSnapshot> {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT app_private.lock_governance('shared')");
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
        version: row?.version ?? 0,
      };
    });
  }
}
