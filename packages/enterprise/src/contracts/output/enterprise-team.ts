import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import type {
  EnterpriseTeam,
  EnterpriseTeamMembership,
  EnterpriseTeamOrganizationAssignment,
} from "../../domain.js";
import type { EnterpriseCommand, EnterpriseReceipt } from "../enterprise-governance.js";

export type EnterpriseTeamCommand = Extract<
  EnterpriseCommand,
  { action: "create-enterprise-team" } | { teamId: string }
>;

export interface EnterpriseTeamTransaction {
  readonly enterpriseStatus: "active" | "inactive";
  authorize(): Promise<void>;
  replay(): Promise<EnterpriseReceipt | null>;
  nextId(): string;
  loadTeam(teamId: string): Promise<EnterpriseTeam | null>;
  saveTeam(team: EnterpriseTeam): Promise<number>;
  loadMembership(teamId: string, userId: string): Promise<EnterpriseTeamMembership | null>;
  requireActiveTarget(userId: string): Promise<void>;
  isAffiliated(userId: string): Promise<boolean>;
  saveMembership(membership: EnterpriseTeamMembership): Promise<number>;
  organizationScope(
    organizationAccountId: string,
  ): Promise<{ attached: boolean; status: "active" | "inactive" | null }>;
  loadAssignment(
    teamId: string,
    organizationAccountId: string,
  ): Promise<EnterpriseTeamOrganizationAssignment | null>;
  saveAssignment(assignment: EnterpriseTeamOrganizationAssignment): Promise<number>;
  organizationIds(teamId: string): Promise<string[]>;
  memberIds(teamId: string): Promise<string[]>;
  assertSourceRemovable(
    organizationAccountId: string,
    userId: string,
    teamId: string,
    affectedUserIds?: readonly string[],
  ): Promise<void>;
  refreshMembership(organizationAccountId: string, userId: string): Promise<void>;
  cancelInvitation(organizationAccountId: string, userId: string): Promise<void>;
  record(result: EnterpriseReceipt): Promise<void>;
}

export interface EnterpriseTeamTransactions {
  transact(
    actor: VerifiedLineActor,
    command: EnterpriseTeamCommand,
    at: number,
    operation: (transaction: EnterpriseTeamTransaction) => Promise<EnterpriseReceipt>,
  ): Promise<EnterpriseReceipt>;
}
