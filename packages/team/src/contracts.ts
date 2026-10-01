export type TeamPrivacy = "SECRET" | "VISIBLE";
export type TeamNotificationSetting = "NOTIFICATIONS_DISABLED" | "NOTIFICATIONS_ENABLED";
type TeamMembershipType = "IMMEDIATE" | "CHILD_TEAM";

export type TeamMembershipView = {
  userId: string;
  name: string;
  status: "pending" | "active" | "removed";
  userStatus: "paused" | "active" | "suspended";
  isMaintainer: boolean;
  membershipType: TeamMembershipType | null;
  sourceTeamId: string | null;
};

export type TeamSummary = {
  id: string;
  organizationAccountId: string;
  name: string;
  slug: string;
  parentTeamId: string | null;
  privacy: TeamPrivacy;
  notificationSetting: TeamNotificationSetting;
  version: number;
  membershipStatus: "none" | "pending" | "active" | "removed";
  membershipType: TeamMembershipType | null;
  isMaintainer: boolean;
};

type TeamOrganizationSummary = {
  organizationAccountId: string;
  login: string;
};

export type TeamView = {
  userId: string;
  organizations: TeamOrganizationSummary[];
  organizationAccountId: string | null;
  organizationLogin: string | null;
  teams: TeamSummary[];
  team: TeamSummary | null;
  childTeams: TeamSummary[];
  members: TeamMembershipView[];
};

export type TeamCommandReceipt = {
  organizationAccountId: string;
  teamId: string;
  userId: string;
};
