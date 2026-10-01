import type { TeamCommand } from "@line_bot_v1/team/application/commands/team-command";
import type { TeamNotificationSetting, TeamPrivacy, TeamView } from "@line_bot_v1/team/contracts";

export type TeamDraft =
  | { action: "create-team"; name: string }
  | { action: "rename-team"; name: string }
  | { action: "join"; name: string; teamId: string }
  | { action: "parent-team"; parentTeamId: string | null }
  | {
      action: "settings";
      privacy: TeamPrivacy;
      notificationSetting: TeamNotificationSetting;
    }
  | {
      action: "membership";
      targetUserId: string;
      status: "active" | "removed";
      title: string;
    }
  | { action: "maintainer"; targetUserId: string; enabled: boolean; title: string };

export const teamActionLabels: Record<TeamCommand["action"], string> = {
  "create-team": "建立團隊",
  "rename-team": "重新命名團隊",
  "parent-team": "更新 Team 階層",
  settings: "更新 Team 設定",
  join: "申請加入",
  membership: "確認成員變更",
  maintainer: "確認維護者變更",
};

export function buildTeamCommand(data: TeamView | null, value: TeamDraft): TeamCommand {
  const context = {
    requestId: crypto.randomUUID(),
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
