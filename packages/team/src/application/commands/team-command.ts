import type { TeamCommand, TeamCommandDraft } from "../../contracts/input/team-command.js";
import type { TeamView } from "../../contracts.js";
import { teamAssert } from "../../domain/errors/team-error.js";

export function buildTeamCommand(
  data: TeamView | null,
  value: TeamCommandDraft,
  requestId: string,
): TeamCommand {
  const context = {
    requestId,
    organizationAccountId: data?.organizationAccountId ?? "",
  };
  if (value.action === "create-team") {
    return {
      ...context,
      action: value.action,
      name: value.name,
      privacy: "SECRET",
      notificationSetting: "NOTIFICATIONS_DISABLED",
    };
  }
  const existing = {
    ...context,
    teamId: value.action === "join" ? value.teamId : (data?.team?.id ?? ""),
    expectedVersion: value.action === "join" ? 0 : (data?.team?.version ?? 0),
  };
  if (value.action === "rename-team" || value.action === "join") {
    return { ...existing, action: value.action, name: value.name };
  }
  if (value.action === "parent-team") {
    return { ...existing, action: value.action, parentTeamId: value.parentTeamId };
  }
  if (value.action === "settings") {
    return {
      ...existing,
      action: value.action,
      privacy: value.privacy,
      notificationSetting: value.notificationSetting,
    };
  }
  if (value.action === "membership") {
    return {
      ...existing,
      action: value.action,
      targetUserId: value.targetUserId,
      status: value.status,
    };
  }
  return {
    ...existing,
    action: value.action,
    targetUserId: value.targetUserId,
    enabled: value.enabled,
  };
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
      value.action === "parent-team" ||
      value.action === "settings" ||
      value.action === "membership" ||
      value.action === "maintainer",
    400,
    "不支援的操作。",
  );
  const action = value.action;
  const allowedByAction: Record<typeof action, readonly string[]> = {
    "create-team": [
      "action",
      "requestId",
      "organizationAccountId",
      "name",
      "privacy",
      "notificationSetting",
    ],
    join: ["action", "requestId", "organizationAccountId", "teamId", "expectedVersion", "name"],
    "rename-team": [
      "action",
      "requestId",
      "organizationAccountId",
      "teamId",
      "expectedVersion",
      "name",
    ],
    "parent-team": [
      "action",
      "requestId",
      "organizationAccountId",
      "teamId",
      "expectedVersion",
      "parentTeamId",
    ],
    settings: [
      "action",
      "requestId",
      "organizationAccountId",
      "teamId",
      "expectedVersion",
      "privacy",
      "notificationSetting",
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
    const privacy = value.privacy ?? "SECRET";
    const notificationSetting = value.notificationSetting ?? "NOTIFICATIONS_DISABLED";
    teamAssert(name.length >= 1 && name.length <= 80, 400, "請核對名稱欄位。");
    teamAssert(privacy === "SECRET" || privacy === "VISIBLE", 400, "Team privacy 無效。");
    teamAssert(
      notificationSetting === "NOTIFICATIONS_DISABLED" ||
        notificationSetting === "NOTIFICATIONS_ENABLED",
      400,
      "Team notification setting 無效。",
    );
    return {
      action,
      requestId,
      organizationAccountId,
      name,
      privacy,
      notificationSetting,
    };
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

  if (action === "parent-team") {
    const parentTeamId =
      value.parentTeamId === null
        ? null
        : typeof value.parentTeamId === "string"
          ? value.parentTeamId.trim()
          : "";
    teamAssert(parentTeamId === null || stableId.test(parentTeamId), 400, "父 Team ID 無效。");
    teamAssert(parentTeamId !== teamId, 400, "Team 不能成為自己的 parent。");
    return {
      action,
      requestId,
      organizationAccountId,
      teamId,
      expectedVersion: Number(expectedVersion),
      parentTeamId,
    };
  }

  if (action === "settings") {
    teamAssert(
      value.privacy === "SECRET" || value.privacy === "VISIBLE",
      400,
      "Team privacy 無效。",
    );
    teamAssert(
      value.notificationSetting === "NOTIFICATIONS_DISABLED" ||
        value.notificationSetting === "NOTIFICATIONS_ENABLED",
      400,
      "Team notification setting 無效。",
    );
    return {
      action,
      requestId,
      organizationAccountId,
      teamId,
      expectedVersion: Number(expectedVersion),
      privacy: value.privacy,
      notificationSetting: value.notificationSetting,
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
