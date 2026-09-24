import type { UserStatus } from "@line-work/account/domain/user";

export type TeamMembershipStatus = "pending" | "active" | "removed";

type TeamCommandContext = Readonly<{
  requestId: string;
  organizationAccountId: string;
}>;

type ExistingTeamCommandBase = TeamCommandContext &
  Readonly<{
    teamId: string;
    expectedVersion: number;
  }>;

export type TeamCommand =
  | (TeamCommandContext &
      Readonly<{
        action: "create-team";
        name: string;
      }>)
  | (ExistingTeamCommandBase &
      Readonly<{
        action: "join";
        name: string;
      }>)
  | (ExistingTeamCommandBase &
      Readonly<{
        action: "rename-team";
        name: string;
      }>)
  | (ExistingTeamCommandBase &
      Readonly<{
        action: "membership";
        targetUserId: string;
        status: "active" | "removed";
      }>)
  | (ExistingTeamCommandBase &
      Readonly<{
        action: "maintainer";
        targetUserId: string;
        enabled: boolean;
      }>);

export type TeamMemberState = Readonly<{
  userId: string;
  userStatus: UserStatus;
  membershipStatus: TeamMembershipStatus;
  isMaintainer: boolean;
}>;

export class TeamError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "TeamError";
  }
}

export function teamAssert(condition: unknown, status: number, message: string): asserts condition {
  if (!condition) throw new TeamError(status, message);
}

export function teamVersion(actual: number, expected: number) {
  teamAssert(actual === expected, 409, "團隊資料已更新，請重新載入後再確認。");
}

const teamSlugPattern = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;

export function normalizeTeamSlug(value: string): string {
  const slug = value.normalize("NFKC").trim().toLowerCase();
  teamAssert(
    slug.length >= 1 && slug.length <= 80 && teamSlugPattern.test(slug),
    400,
    "Team slug 不正確。",
  );
  return slug;
}

export function teamSlugFromName(value: string): string {
  const slug = value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return normalizeTeamSlug(slug);
}

export function requireTeamMaintainer(isMaintainer: boolean) {
  teamAssert(isMaintainer, 403, "需要團隊維護者權限。");
}

export function requireAnotherEffectiveMaintainer(
  members: readonly TeamMemberState[],
  targetUserId: string,
) {
  teamAssert(
    members.some(
      (member) =>
        member.userId !== targetUserId &&
        member.userStatus === "active" &&
        member.membershipStatus === "active" &&
        member.isMaintainer,
    ),
    409,
    "不能移除或降權最後一位有效團隊維護者。",
  );
}

const stableId = /^[\w-]{1,128}$/;
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function parseTeamCommand(input: unknown): TeamCommand {
  teamAssert(input && typeof input === "object" && !Array.isArray(input), 400, "資料格式錯誤。");
  const value = input as Record<string, unknown>;
  teamAssert(
    value.action === "create-team" ||
      value.action === "join" ||
      value.action === "rename-team" ||
      value.action === "membership" ||
      value.action === "maintainer",
    400,
    "不支援的操作。",
  );
  const action = value.action;
  const allowedByAction: Record<typeof action, readonly string[]> = {
    "create-team": ["action", "requestId", "organizationAccountId", "name"],
    join: ["action", "requestId", "organizationAccountId", "teamId", "expectedVersion", "name"],
    "rename-team": [
      "action",
      "requestId",
      "organizationAccountId",
      "teamId",
      "expectedVersion",
      "name",
    ],
    membership: [
      "action",
      "requestId",
      "organizationAccountId",
      "teamId",
      "expectedVersion",
      "targetUserId",
      "status",
    ],
    maintainer: [
      "action",
      "requestId",
      "organizationAccountId",
      "teamId",
      "expectedVersion",
      "targetUserId",
      "enabled",
    ],
  };
  teamAssert(
    !Object.keys(value).some((key) => !allowedByAction[action].includes(key)),
    400,
    "資料包含不支援的欄位。",
  );

  const requestId = typeof value.requestId === "string" ? value.requestId.toLowerCase() : "";
  const organizationAccountId =
    typeof value.organizationAccountId === "string" ? value.organizationAccountId.trim() : "";
  teamAssert(uuid.test(requestId), 400, "請求編號無效。");
  teamAssert(stableId.test(organizationAccountId), 400, "組織帳號 ID 無效。");

  if (action === "create-team") {
    const name = typeof value.name === "string" ? value.name.trim() : "";
    teamAssert(name.length >= 1 && name.length <= 80, 400, "請核對名稱欄位。");
    return { action, requestId, organizationAccountId, name };
  }

  const teamId = typeof value.teamId === "string" ? value.teamId.trim() : "";
  const expectedVersion = value.expectedVersion ?? 0;
  teamAssert(stableId.test(teamId), 400, "團隊 ID 無效。");
  teamAssert(
    Number.isSafeInteger(expectedVersion) && Number(expectedVersion) >= 0,
    400,
    "版本無效。",
  );

  if (action === "join" || action === "rename-team") {
    const name = typeof value.name === "string" ? value.name.trim() : "";
    teamAssert(name.length >= 1 && name.length <= 80, 400, "請核對名稱欄位。");
    return {
      action,
      requestId,
      organizationAccountId,
      teamId,
      expectedVersion: Number(expectedVersion),
      name,
    };
  }

  const targetUserId = typeof value.targetUserId === "string" ? value.targetUserId.trim() : "";
  teamAssert(stableId.test(targetUserId), 400, "使用者 ID 無效。");
  if (action === "membership") {
    teamAssert(value.status === "active" || value.status === "removed", 400, "成員狀態無效。");
    return {
      action,
      requestId,
      organizationAccountId,
      teamId,
      expectedVersion: Number(expectedVersion),
      targetUserId,
      status: value.status,
    };
  }
  teamAssert(typeof value.enabled === "boolean", 400, "維護者設定無效。");
  return {
    action,
    requestId,
    organizationAccountId,
    teamId,
    expectedVersion: Number(expectedVersion),
    targetUserId,
    enabled: value.enabled,
  };
}
