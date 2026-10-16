import {
  booleanValue,
  literalValue,
  nullableString,
  numberValue,
  record,
  stringValue,
} from "@line_bot_v1/platform/validation";

export type { TeamNotificationSetting, TeamPrivacy } from "./domain/team.js";

import type { TeamNotificationSetting, TeamPrivacy } from "./domain/team.js";

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
  canManage: boolean;
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
  viewerCanCreateTeams: boolean;
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

function arrayValue<T>(value: unknown, decode: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new TypeError("Expected an array");
  return value.map((item: unknown) => decode(item));
}

function nullableMembershipType(value: unknown): TeamMembershipType | null {
  return value === null ? null : literalValue(value, ["IMMEDIATE", "CHILD_TEAM"]);
}

function parseTeamSummary(value: unknown): TeamSummary {
  const team = record(value);
  return {
    id: stringValue(team.id),
    organizationAccountId: stringValue(team.organizationAccountId),
    name: stringValue(team.name),
    slug: stringValue(team.slug),
    parentTeamId: nullableString(team.parentTeamId),
    privacy: literalValue(team.privacy, ["SECRET", "VISIBLE"]),
    notificationSetting: literalValue(team.notificationSetting, [
      "NOTIFICATIONS_DISABLED",
      "NOTIFICATIONS_ENABLED",
    ]),
    version: numberValue(team.version),
    membershipStatus: literalValue(team.membershipStatus, ["none", "pending", "active", "removed"]),
    membershipType: nullableMembershipType(team.membershipType),
    isMaintainer: booleanValue(team.isMaintainer),
    canManage: booleanValue(team.canManage),
  };
}

function parseTeamOrganization(value: unknown): TeamOrganizationSummary {
  const organization = record(value);
  return {
    organizationAccountId: stringValue(organization.organizationAccountId),
    login: stringValue(organization.login),
  };
}

function parseTeamMembership(value: unknown): TeamMembershipView {
  const membership = record(value);
  return {
    userId: stringValue(membership.userId),
    name: stringValue(membership.name),
    status: literalValue(membership.status, ["pending", "active", "removed"]),
    userStatus: literalValue(membership.userStatus, ["paused", "active", "suspended"]),
    isMaintainer: booleanValue(membership.isMaintainer),
    membershipType: nullableMembershipType(membership.membershipType),
    sourceTeamId: nullableString(membership.sourceTeamId),
  };
}

export function parseTeamView(value: unknown): TeamView {
  const view = record(value);
  return {
    userId: stringValue(view.userId),
    organizations: arrayValue(view.organizations, parseTeamOrganization),
    organizationAccountId: nullableString(view.organizationAccountId),
    organizationLogin: nullableString(view.organizationLogin),
    viewerCanCreateTeams: booleanValue(view.viewerCanCreateTeams),
    teams: arrayValue(view.teams, parseTeamSummary),
    team: view.team === null ? null : parseTeamSummary(view.team),
    childTeams: arrayValue(view.childTeams, parseTeamSummary),
    members: arrayValue(view.members, parseTeamMembership),
  };
}
