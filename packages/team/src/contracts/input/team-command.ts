import type { TeamNotificationSetting, TeamPrivacy } from "../../contracts.js";

type TeamCommandContext = Readonly<{
  requestId: string;
  organizationAccountId: string;
}>;

type ExistingTeamCommandBase = TeamCommandContext &
  Readonly<{
    teamId: string;
    expectedVersion: number;
  }>;

export type TeamCommandDraft =
  | { action: "create-team"; name: string }
  | { action: "rename-team"; name: string }
  | { action: "join"; name: string; teamId: string }
  | { action: "parent-team"; parentTeamId: string | null }
  | {
      action: "settings";
      privacy: TeamPrivacy;
      notificationSetting: TeamNotificationSetting;
    }
  | { action: "membership"; targetUserId: string; status: "active" | "removed" }
  | { action: "maintainer"; targetUserId: string; enabled: boolean };

export type TeamCommand =
  | (TeamCommandContext &
      Readonly<{
        action: "create-team";
        name: string;
        privacy: TeamPrivacy;
        notificationSetting: TeamNotificationSetting;
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
        action: "parent-team";
        parentTeamId: string | null;
      }>)
  | (ExistingTeamCommandBase &
      Readonly<{
        action: "settings";
        privacy: TeamPrivacy;
        notificationSetting: TeamNotificationSetting;
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
