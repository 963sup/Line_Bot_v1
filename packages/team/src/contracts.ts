export type TeamMembershipView = {
  userId: string;
  name: string;
  status: "pending" | "active" | "removed";
  userStatus: "paused" | "active" | "suspended";
  isMaintainer: boolean;
};

export type TeamSummary = {
  id: string;
  organizationAccountId: string;
  name: string;
  slug: string;
  version: number;
  membershipStatus: "pending" | "active" | "removed";
  isMaintainer: boolean;
};

export type TeamOrganizationSummary = {
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
  members: TeamMembershipView[];
};

export type TeamCommandReceipt = {
  organizationAccountId: string;
  teamId: string;
  userId: string;
};
