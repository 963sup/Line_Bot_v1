import type { TeamCommandReceipt } from "../../contracts.js";
import type {
  DirectTeamMembership,
  MaintainerAssignment,
  TeamMemberFact,
  TeamState,
} from "../../domain/team.js";
import type { TeamActor } from "../input/team-collaboration.js";

export type TeamMutationScope = Readonly<{
  organizationAccountId: string;
}>;

export type TeamMutationEvidence = Readonly<{
  requestId: string;
  payload: string;
  action: string;
  at: number;
}>;

export type TeamReplay = Readonly<{
  evidenceMatches: boolean;
  receipt: TeamCommandReceipt;
  teamId: string;
}>;

type TeamMutationActor = Readonly<{
  userId: string;
  userStatusVersion: number;
  isOrganizationOwner: boolean;
  canCreateTeams: boolean;
}>;

export interface TeamMutationTransaction {
  readonly actor: TeamMutationActor;
  readonly replay: TeamReplay | null;
  newTeamId(): string;
  lockTeam(teamId: string): Promise<TeamState>;
  lockParent(teamId: string): Promise<TeamState>;
  directMemberships(teamId: string): Promise<readonly DirectTeamMembership[]>;
  memberFacts(teamId: string): Promise<readonly TeamMemberFact[]>;
  isMaintainer(teamId: string, userId: string): Promise<boolean>;
  activeOrganizationParticipants(userIds: readonly string[]): Promise<ReadonlySet<string>>;
  activeUserStatusVersion(userId: string): Promise<number | null>;
  createTeam(team: TeamState, creatorUserId: string, at: number): Promise<void>;
  saveTeamName(teamId: string, name: string, slug: string): Promise<void>;
  saveTeamSettings(
    teamId: string,
    privacy: TeamState["privacy"],
    notificationSetting: TeamState["notificationSetting"],
  ): Promise<void>;
  saveTeamParent(teamId: string, parentTeamId: string | null): Promise<void>;
  saveMembership(teamId: string, membership: DirectTeamMembership): Promise<void>;
  maintainerAssignment(teamId: string, targetUserId: string): Promise<MaintainerAssignment | null>;
  saveMaintainerAssignment(
    teamId: string,
    targetUserId: string,
    assignment: MaintainerAssignment,
    at: number,
  ): Promise<void>;
  incrementTeamVersion(teamId: string): Promise<number>;
  record(
    teamId: string,
    receipt: TeamCommandReceipt,
    details: Readonly<Record<string, unknown>>,
  ): Promise<void>;
}

export interface TeamMutationTransactions {
  transact<T>(
    actor: TeamActor,
    scope: TeamMutationScope,
    evidence: TeamMutationEvidence,
    operation: (transaction: TeamMutationTransaction) => Promise<T>,
  ): Promise<T>;
}
