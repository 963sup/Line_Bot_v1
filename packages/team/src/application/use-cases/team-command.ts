import { TeamError, teamAssert } from "../../contracts/errors/team-error.js";
import type { TeamActor } from "../../contracts/input/team-collaboration.js";
import type { TeamCommand } from "../../contracts/input/team-command.js";
import type {
  TeamMutationTransaction,
  TeamMutationTransactions,
} from "../../contracts/output/team-mutation.js";
import type { TeamCommandReceipt } from "../../contracts.js";
import {
  changeDirectMembership,
  changeTeamParent,
  changeTeamSettings,
  createTeam,
  grantMaintainerAssignment,
  renameTeam,
  requestTeamJoin,
  requireActiveMaintainerTarget,
  requireAnotherEffectiveMaintainer,
  requireMaintainerChange,
  requireMaintainerOrganizationParticipant,
  requireTeamVersion,
  revokeMaintainerAssignment,
  TeamDomainError,
} from "../../domain/team.js";

function requireTeamManager(allowed: boolean): void {
  teamAssert(allowed, 403, "需要 TeamMaintainer 或 OrganizationOwner 權限。");
}

function presentDomainError(error: unknown): never {
  if (!(error instanceof TeamDomainError)) throw error;
  const status =
    error.code === "invalid-slug"
      ? 400
      : error.code === "invalid-membership" ||
          error.code === "maintainer-organization-ineligible" ||
          error.code === "maintainer-team-ineligible"
        ? 403
        : error.code === "maintainer-missing"
          ? 404
          : 409;
  throw new TeamError(status, error.message);
}

function resultUserId(command: TeamCommand, actorUserId: string): string {
  return command.action === "membership" || command.action === "maintainer"
    ? command.targetUserId
    : actorUserId;
}

async function grantMaintainer(
  transaction: TeamMutationTransaction,
  teamId: string,
  targetUserId: string,
  expectedUserStatusVersion: number,
  at: number,
): Promise<void> {
  const activeUserStatusVersion = await transaction.activeUserStatusVersion(targetUserId);
  const participants = await transaction.activeOrganizationParticipants([targetUserId]);
  const membership = (await transaction.directMemberships(teamId)).find(
    (candidate) => candidate.userId === targetUserId,
  );
  const current = await transaction.maintainerAssignment(teamId, targetUserId);
  const next = grantMaintainerAssignment(current, {
    expectedUserStatusVersion,
    activeUserStatusVersion,
    organizationParticipant: participants.has(targetUserId),
    membership: membership ?? null,
  });
  if (next !== current) {
    await transaction.saveMaintainerAssignment(teamId, targetUserId, next, at);
  }
}

async function revokeMaintainer(
  transaction: TeamMutationTransaction,
  teamId: string,
  targetUserId: string,
  at: number,
): Promise<void> {
  const current = await transaction.maintainerAssignment(teamId, targetUserId);
  const next = revokeMaintainerAssignment(current);
  await transaction.saveMaintainerAssignment(teamId, targetUserId, next, at);
}

async function authorizeReplay(
  transaction: TeamMutationTransaction,
  command: TeamCommand,
): Promise<TeamCommandReceipt | null> {
  const replay = transaction.replay;
  if (!replay) return null;
  teamAssert(replay.evidenceMatches, 409, "請求編號已用於不同內容。");
  await transaction.lockTeam(replay.teamId);
  const memberships = await transaction.directMemberships(replay.teamId);
  const current = memberships.find((member) => member.userId === transaction.actor.userId);
  const selfRemoval =
    command.action === "membership" &&
    command.targetUserId === transaction.actor.userId &&
    command.status === "removed";
  teamAssert(
    current?.status === "active" ||
      transaction.actor.isOrganizationOwner ||
      (command.action === "join" && current?.status === "pending") ||
      selfRemoval,
    403,
    "團隊資格已變更。",
  );
  if (
    command.action === "rename-team" ||
    command.action === "parent-team" ||
    command.action === "settings" ||
    (command.action === "membership" && !selfRemoval) ||
    command.action === "maintainer"
  ) {
    requireTeamManager(
      transaction.actor.isOrganizationOwner ||
        (await transaction.isMaintainer(replay.teamId, transaction.actor.userId)),
    );
  }
  if (command.action === "parent-team" && command.parentTeamId) {
    await transaction.lockParent(command.parentTeamId);
    requireTeamManager(
      transaction.actor.isOrganizationOwner ||
        (await transaction.isMaintainer(command.parentTeamId, transaction.actor.userId)),
    );
  }
  return replay.receipt;
}

export class TeamCommandUseCase {
  constructor(private readonly transactions: TeamMutationTransactions) {}

  execute(actor: TeamActor, input: TeamCommand, at: number): Promise<TeamCommandReceipt> {
    const command: TeamCommand = { ...input };
    return this.transactions.transact(
      actor,
      { organizationAccountId: command.organizationAccountId },
      {
        requestId: command.requestId,
        payload: JSON.stringify(command),
        action: command.action,
        at,
      },
      async (transaction) => {
        try {
          const replay = await authorizeReplay(transaction, command);
          if (replay) return replay;

          const teamId =
            command.action === "create-team" ? transaction.newTeamId() : command.teamId;
          let details: Record<string, unknown> = {};

          if (command.action === "create-team") {
            teamAssert(
              transaction.actor.canCreateTeams,
              403,
              "目前 Organization capability 不允許建立 Team。",
            );
            const initial = createTeam({
              id: teamId,
              organizationAccountId: command.organizationAccountId,
              name: command.name,
              privacy: command.privacy,
              notificationSetting: command.notificationSetting,
              creatorUserId: transaction.actor.userId,
            });
            await transaction.createTeam(initial.team, transaction.actor.userId, at);
            await transaction.saveMembership(teamId, initial.creatorMembership);
            await grantMaintainer(
              transaction,
              teamId,
              transaction.actor.userId,
              transaction.actor.userStatusVersion,
              at,
            );
          } else {
            const team = await transaction.lockTeam(teamId);
            const memberships = await transaction.directMemberships(teamId);
            const me = memberships.find((member) => member.userId === transaction.actor.userId);
            const canManage =
              transaction.actor.isOrganizationOwner ||
              (await transaction.isMaintainer(teamId, transaction.actor.userId));

            if (command.action === "rename-team") {
              requireTeamManager(canManage);
              requireTeamVersion(team.version, command.expectedVersion);
              const next = renameTeam(team, command.name);
              await transaction.saveTeamName(next.id, next.name, next.slug);
              details = {
                previousName: team.name,
                previousSlug: team.slug,
                name: next.name,
                slug: next.slug,
              };
            } else if (command.action === "settings") {
              requireTeamManager(canManage);
              requireTeamVersion(team.version, command.expectedVersion);
              const next = changeTeamSettings(team, command.privacy, command.notificationSetting);
              await transaction.saveTeamSettings(next.id, next.privacy, next.notificationSetting);
              details = {
                previousPrivacy: team.privacy,
                privacy: next.privacy,
                previousNotificationSetting: team.notificationSetting,
                notificationSetting: next.notificationSetting,
              };
            } else if (command.action === "parent-team") {
              requireTeamManager(canManage);
              requireTeamVersion(team.version, command.expectedVersion);
              const next = changeTeamParent(team, command.parentTeamId);
              if (command.parentTeamId) {
                await transaction.lockParent(command.parentTeamId);
                requireTeamManager(
                  transaction.actor.isOrganizationOwner ||
                    (await transaction.isMaintainer(
                      command.parentTeamId,
                      transaction.actor.userId,
                    )),
                );
              }
              await transaction.saveTeamParent(next.id, next.parentTeamId);
              details = {
                previousParentTeamId: team.parentTeamId,
                parentTeamId: next.parentTeamId,
              };
            } else if (command.action === "join") {
              const next = requestTeamJoin(me ?? null, transaction.actor.userId, command.name);
              await transaction.saveMembership(teamId, next);
            } else {
              teamAssert(
                me?.status === "active" || transaction.actor.isOrganizationOwner,
                403,
                "你沒有此團隊的操作權。",
              );
              requireTeamVersion(team.version, command.expectedVersion);
              const target = memberships.find((member) => member.userId === command.targetUserId);
              teamAssert(
                target && target.status !== "removed",
                404,
                "找不到此加入申請或有效成員。",
              );

              if (command.action === "membership") {
                const selfRemoval =
                  command.targetUserId === transaction.actor.userId && command.status === "removed";
                if (!selfRemoval) requireTeamManager(canManage);
                if (command.status === "active") {
                  const eligible = await transaction.activeOrganizationParticipants([
                    command.targetUserId,
                  ]);
                  teamAssert(
                    eligible.has(command.targetUserId),
                    403,
                    "對象不是此組織的有效使用者。",
                  );
                }
                details = {
                  userId: command.targetUserId,
                  previousStatus: target.status,
                  status: command.status,
                };
                const facts = await transaction.memberFacts(teamId);
                const targetFact = facts.find((member) => member.userId === command.targetUserId);
                if (targetFact?.isMaintainer && command.status === "removed") {
                  requireAnotherEffectiveMaintainer(facts, command.targetUserId);
                  const targetStatusVersion = await transaction.activeUserStatusVersion(
                    command.targetUserId,
                  );
                  teamAssert(targetStatusVersion !== null, 403, "對象使用者不可用。");
                  await revokeMaintainer(transaction, teamId, command.targetUserId, at);
                }
                await transaction.saveMembership(
                  teamId,
                  changeDirectMembership(target, command.status),
                );
              } else {
                requireTeamManager(canManage);
                requireActiveMaintainerTarget(target);
                const currentlyMaintainer = await transaction.isMaintainer(
                  teamId,
                  command.targetUserId,
                );
                requireMaintainerChange(currentlyMaintainer, command.enabled);
                const eligible = await transaction.activeOrganizationParticipants([
                  command.targetUserId,
                ]);
                requireMaintainerOrganizationParticipant(eligible.has(command.targetUserId));
                const targetStatusVersion = await transaction.activeUserStatusVersion(
                  command.targetUserId,
                );
                teamAssert(targetStatusVersion !== null, 403, "對象使用者不可用。");
                details = {
                  userId: command.targetUserId,
                  previousMaintainer: currentlyMaintainer,
                  maintainer: command.enabled,
                };
                if (command.enabled) {
                  await grantMaintainer(
                    transaction,
                    teamId,
                    command.targetUserId,
                    targetStatusVersion,
                    at,
                  );
                } else {
                  const facts = await transaction.memberFacts(teamId);
                  requireAnotherEffectiveMaintainer(facts, command.targetUserId);
                  await revokeMaintainer(transaction, teamId, command.targetUserId, at);
                }
              }
            }
          }

          const version = await transaction.incrementTeamVersion(teamId);
          const receipt: TeamCommandReceipt = {
            organizationAccountId: command.organizationAccountId,
            teamId,
            userId: resultUserId(command, transaction.actor.userId),
          };
          await transaction.record(teamId, receipt, { ...details, teamVersion: version });
          return receipt;
        } catch (error) {
          return presentDomainError(error);
        }
      },
    );
  }
}
