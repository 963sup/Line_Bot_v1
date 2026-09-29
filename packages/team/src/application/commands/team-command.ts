import { teamAssert } from "../../domain/errors/team-error.js";

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
