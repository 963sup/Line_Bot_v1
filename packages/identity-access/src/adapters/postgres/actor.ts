import {
  readActiveUserQualification,
  readUserByIdentity,
} from "@line-work/account/adapters/postgres";
import type { VerifiedLineActor } from "@line-work/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line-work/identity-access/domain/role-assignment";
import type { Sql } from "@line-work/platform/adapters/postgres";

export type ResolvedGovernanceActor = Readonly<{
  userId: string;
  userStatusVersion: number;
}>;

export async function resolveVerifiedLineActor(
  sql: Sql,
  actor: VerifiedLineActor,
): Promise<ResolvedGovernanceActor> {
  if (
    !actor ||
    typeof actor.provider !== "string" ||
    !actor.provider.trim() ||
    actor.provider.length > 256 ||
    typeof actor.subject !== "string" ||
    !actor.subject ||
    actor.subject.length > 512
  ) {
    throw new GovernanceAccessError(403, "forbidden", "LINE 身分證明無效。");
  }
  const user = await readUserByIdentity(sql, actor.provider, actor.subject, "share");
  if (!user || user.status !== "active") {
    throw new GovernanceAccessError(403, "forbidden", "LINE 使用者資格已失效。");
  }
  return { userId: user.id, userStatusVersion: user.statusVersion };
}

export async function requireActiveTargetUser(sql: Sql, userId: string) {
  const user = await readActiveUserQualification(sql, userId, "share");
  if (!user) {
    throw new GovernanceAccessError(404, "not-found", "找不到有效對象使用者。");
  }
  return { userId: user.id, userStatusVersion: user.statusVersion };
}
