import type {
  PostgresFollowStore,
  PostgresUserAchievementStore,
  PostgresUserManagement,
  PostgresUserProfileStore,
  PostgresUserStore,
} from "@line_bot_v1/account/postgres";
import type { WebhookIdempotencyStore } from "@line_bot_v1/assistant/application/webhook-router";
import type { createPostgresAttendanceStore } from "@line_bot_v1/attendance/composition/bootstrap/postgres-attendance-store";
import type { createPostgresDailyCheckInStore } from "@line_bot_v1/daily-check-in/composition/bootstrap/postgres-daily-check-in-store";
import type { createPostgresExpenseStore } from "@line_bot_v1/expense/composition/bootstrap/postgres-expense-store";
import type { PostgresOrganizationPublicStore } from "@line_bot_v1/organization/postgres/public";
import type { RedisRateLimiter, RedisSessionStore } from "@line_bot_v1/platform/redis";
import type { PostgresPublicRepositoryStore } from "@line_bot_v1/repository/postgres/public";
import type { PostgresWalletStore } from "@line_bot_v1/wallet/postgres";

type DevelopmentSessions = {
  create(id: string, value: string, seconds: number): Promise<boolean>;
  get(id: string): Promise<string | null>;
  update(id: string, expectedValue: string, value: string, seconds: number): Promise<boolean>;
  replace(previousId: string, nextId: string, value: string, seconds: number): Promise<boolean>;
  delete(id: string): Promise<boolean>;
};

declare global {
  var achievementStore: PostgresUserAchievementStore | undefined;
  var attendanceStore: ReturnType<typeof createPostgresAttendanceStore> | undefined;
  var dailyCheckInStore: ReturnType<typeof createPostgresDailyCheckInStore> | undefined;
  var developmentSessions: DevelopmentSessions | undefined;
  var expenseStore: ReturnType<typeof createPostgresExpenseStore> | undefined;
  var followStore: PostgresFollowStore | undefined;
  var lineIdempotency: WebhookIdempotencyStore | undefined;
  var organizationPublicStore: PostgresOrganizationPublicStore | undefined;
  var profileStore: PostgresUserProfileStore | undefined;
  var publicRepositoryStore: PostgresPublicRepositoryStore | undefined;
  var redisLimiter: RedisRateLimiter | undefined;
  var redisSessions: RedisSessionStore | undefined;
  var userManagementStore: PostgresUserManagement | undefined;
  var userStore: PostgresUserStore | undefined;
  var walletStore: PostgresWalletStore | undefined;
}

export {};
