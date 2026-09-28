import type { TeamView } from "../contracts.js";
import type { TeamCommand } from "../domain.js";

export type TeamCommandDraft =
  | { action: "create-team"; name: string }
  | { action: "rename-team"; name: string }
  | { action: "join"; name: string; teamId: string }
  | {
      action: "membership";
      targetUserId: string;
      status: "active" | "removed";
    }
  | { action: "maintainer"; targetUserId: string; enabled: boolean };

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
    return { ...context, action: value.action, name: value.name };
  }
  const existing = {
    ...context,
    teamId: value.action === "join" ? value.teamId : (data?.team?.id ?? ""),
    expectedVersion:
      value.action === "rename-team" ||
      value.action === "membership" ||
      value.action === "maintainer"
        ? (data?.team?.version ?? 0)
        : 0,
  };
  if (value.action === "rename-team" || value.action === "join") {
    return { ...existing, action: value.action, name: value.name };
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
