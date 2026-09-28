import type { TeamCommand } from "@line_bot_v1/team/domain";

export type TeamDraft =
  | { action: "create-team"; name: string }
  | { action: "rename-team"; name: string }
  | { action: "join"; name: string; teamId: string }
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
  join: "申請加入",
  membership: "確認成員變更",
  maintainer: "確認維護者變更",
};
