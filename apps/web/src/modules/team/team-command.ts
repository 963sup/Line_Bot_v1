import { buildTeamCommand as buildOwnedTeamCommand } from "@line_bot_v1/team/application/commands/team-command";
import type { TeamNotificationSetting, TeamPrivacy, TeamView } from "@line_bot_v1/team/contracts";
import type { TeamCommand, TeamCommandDraft } from "@line_bot_v1/team/contracts/input/team-command";

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
  const draft =
    value.action === "membership"
      ? ({
          action: value.action,
          targetUserId: value.targetUserId,
          status: value.status,
        } satisfies TeamCommandDraft)
      : value.action === "maintainer"
        ? ({
            action: value.action,
            targetUserId: value.targetUserId,
            enabled: value.enabled,
          } satisfies TeamCommandDraft)
        : value;
  return buildOwnedTeamCommand(data, draft, crypto.randomUUID());
}
