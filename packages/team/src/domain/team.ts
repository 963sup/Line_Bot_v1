import { NamespaceError, normalizeNamespaceName } from "@line_bot_v1/namespace";

export type TeamDomainErrorCode =
  | "invalid-slug"
  | "version-conflict"
  | "unchanged"
  | "invalid-membership"
  | "last-maintainer"
  | "user-version-conflict"
  | "maintainer-organization-ineligible"
  | "maintainer-team-ineligible"
  | "maintainer-missing"
  | "maintainer-revoked"
  | "maintainer-target-ineligible"
  | "maintainer-unchanged";

export class TeamDomainError extends Error {
  constructor(
    public readonly code: TeamDomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TeamDomainError";
  }
}

export type TeamPrivacy = "SECRET" | "VISIBLE";
export type TeamNotificationSetting = "NOTIFICATIONS_DISABLED" | "NOTIFICATIONS_ENABLED";

export type TeamState = Readonly<{
  id: string;
  organizationAccountId: string;
  name: string;
  slug: string;
  parentTeamId: string | null;
  privacy: TeamPrivacy;
  notificationSetting: TeamNotificationSetting;
  version: number;
}>;

export type DirectTeamMembership = Readonly<{
  userId: string;
  name: string;
  status: "pending" | "active" | "removed";
  version: number;
}>;

export type TeamMemberFact = Readonly<{
  userId: string;
  userIsActive: boolean;
  membershipStatus: DirectTeamMembership["status"];
  isMaintainer: boolean;
}>;

export type MaintainerAssignment = Readonly<{
  status: "active" | "revoked";
  version: number;
  userStatusVersion: number;
  membershipVersion: number;
}>;

export function createTeam(
  input: Readonly<{
    id: string;
    organizationAccountId: string;
    name: string;
    privacy: TeamState["privacy"];
    notificationSetting: TeamState["notificationSetting"];
    creatorUserId: string;
  }>,
): Readonly<{ team: TeamState; creatorMembership: DirectTeamMembership }> {
  return {
    team: {
      id: input.id,
      organizationAccountId: input.organizationAccountId,
      name: input.name,
      slug: teamSlugFromNameValue(input.name),
      parentTeamId: null,
      privacy: input.privacy,
      notificationSetting: input.notificationSetting,
      version: 0,
    },
    creatorMembership: {
      userId: input.creatorUserId,
      name: "建立者",
      status: "active",
      version: 1,
    },
  };
}

export function normalizeTeamSlugValue(value: string): string {
  try {
    return normalizeNamespaceName("organization-team-slug", value);
  } catch (error) {
    if (!(error instanceof NamespaceError)) throw error;
    throw new TeamDomainError("invalid-slug", "Team slug 不正確。");
  }
}

export function teamSlugFromNameValue(value: string): string {
  return normalizeTeamSlugValue(
    value
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, ""),
  );
}

export function requireTeamVersion(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new TeamDomainError("version-conflict", "團隊資料已更新，請重新載入後再確認。");
  }
}

export function renameTeam(team: TeamState, name: string): TeamState {
  if (team.name === name) throw new TeamDomainError("unchanged", "團隊名稱沒有變更。");
  return { ...team, name, slug: teamSlugFromNameValue(name) };
}

export function changeTeamSettings(
  team: TeamState,
  privacy: TeamState["privacy"],
  notificationSetting: TeamState["notificationSetting"],
): TeamState {
  if (team.privacy === privacy && team.notificationSetting === notificationSetting) {
    throw new TeamDomainError("unchanged", "Team 設定沒有變更。");
  }
  return { ...team, privacy, notificationSetting };
}

export function changeTeamParent(team: TeamState, parentTeamId: string | null): TeamState {
  if (team.parentTeamId === parentTeamId) {
    throw new TeamDomainError("unchanged", "Team parent 沒有變更。");
  }
  return { ...team, parentTeamId };
}

export function requestTeamJoin(
  current: DirectTeamMembership | null,
  userId: string,
  name: string,
): DirectTeamMembership {
  if (current && current.status !== "pending") {
    throw new TeamDomainError("invalid-membership", "你已加入或曾被移除，請聯絡維護者。");
  }
  return current ? { ...current, name } : { userId, name, status: "pending", version: 1 };
}

export function changeDirectMembership(
  current: DirectTeamMembership,
  status: "active" | "removed",
): DirectTeamMembership {
  return {
    ...current,
    status,
    version: current.status === status ? current.version : current.version + 1,
  };
}

export function requireAnotherEffectiveMaintainer(
  members: readonly TeamMemberFact[],
  targetUserId: string,
): void {
  if (
    !members.some(
      (member) =>
        member.userId !== targetUserId &&
        member.userIsActive &&
        member.membershipStatus === "active" &&
        member.isMaintainer,
    )
  ) {
    throw new TeamDomainError("last-maintainer", "不能移除或降權最後一位有效團隊維護者。");
  }
}

export function grantMaintainerAssignment(
  current: MaintainerAssignment | null,
  facts: Readonly<{
    expectedUserStatusVersion: number;
    activeUserStatusVersion: number | null;
    organizationParticipant: boolean;
    membership: DirectTeamMembership | null;
  }>,
): MaintainerAssignment {
  if (
    facts.activeUserStatusVersion === null ||
    facts.activeUserStatusVersion !== facts.expectedUserStatusVersion
  ) {
    throw new TeamDomainError("user-version-conflict", "使用者資格版本已更新。");
  }
  if (!facts.organizationParticipant) {
    throw new TeamDomainError(
      "maintainer-organization-ineligible",
      "TeamMaintainer 必須是有效 Organization member。",
    );
  }
  if (!facts.membership || facts.membership.status !== "active") {
    throw new TeamDomainError(
      "maintainer-team-ineligible",
      "TeamMaintainer 必須是有效 Team member。",
    );
  }
  if (
    current?.status === "active" &&
    current.userStatusVersion === facts.activeUserStatusVersion &&
    current.membershipVersion === facts.membership.version
  ) {
    return current;
  }
  return {
    status: "active",
    version: (current?.version ?? 0) + 1,
    userStatusVersion: facts.activeUserStatusVersion,
    membershipVersion: facts.membership.version,
  };
}

export function revokeMaintainerAssignment(
  current: MaintainerAssignment | null,
): MaintainerAssignment {
  if (!current) {
    throw new TeamDomainError("maintainer-missing", "找不到 TeamMaintainer 指派。");
  }
  if (current.status !== "active") {
    throw new TeamDomainError("maintainer-revoked", "TeamMaintainer 已撤銷。");
  }
  return { ...current, status: "revoked", version: current.version + 1 };
}

export function requireActiveMaintainerTarget(membership: DirectTeamMembership): void {
  if (membership.status !== "active") {
    throw new TeamDomainError(
      "maintainer-target-ineligible",
      "TeamMaintainer 對象必須是有效 Team member。",
    );
  }
}

export function requireMaintainerOrganizationParticipant(organizationParticipant: boolean): void {
  if (!organizationParticipant) {
    throw new TeamDomainError("maintainer-organization-ineligible", "對象不是此組織的有效使用者。");
  }
}

export function requireMaintainerChange(currentlyMaintainer: boolean, enabled: boolean): void {
  if (currentlyMaintainer === enabled) {
    throw new TeamDomainError("maintainer-unchanged", "TeamMaintainer 狀態沒有變更。");
  }
}
