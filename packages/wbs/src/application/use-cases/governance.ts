import type { RepositorySelector } from "@line_bot_v1/repository/contracts/selectors";
import type { WbsGovernanceCommand, WbsGovernanceQuery } from "../../contracts/dto/governance.js";
import type {
  WbsGovernanceChange,
  WbsGovernanceStore,
} from "../../contracts/repositories/governance.js";
import { WbsError } from "../../domain/document.js";
import { canGovernWbs } from "../../domain/policies/access.js";
import {
  assertOpenWbsProposal,
  assertWbsCandidate,
  changeWbsPolicy,
  finishWbsProposal,
  nextGovernanceVersion,
  proposeWbsScope,
  publishWbsScope,
  reviewWbsScope,
  reviseWbsProposal,
} from "../../domain/scope-governance.js";
import { parseWbsGovernanceCommand } from "../commands/governance.js";
import { parseWbsGovernanceQuery } from "../queries/governance.js";

export function executeWbsGovernanceCommand(
  store: WbsGovernanceStore,
  userId: string,
  command: WbsGovernanceCommand,
  now: number,
) {
  return store.transact(userId, command, async (transaction) => {
    if (!canGovernWbs(transaction.scope.permissions, command.action))
      throw new WbsError(403, "目前 Repository 權限不能執行此治理操作。");
    const replay = await transaction.replay();
    if (replay) return replay;
    if (transaction.scope.archived)
      throw new WbsError(409, "Repository 已封存，不能修改治理資料。");
    if (!(await transaction.hasContent())) throw new WbsError(409, "請先初始化 WBS 草稿。");
    const state = await transaction.loadState();
    const version = nextGovernanceVersion(
      state,
      command.expectedVersion,
      "expectedPolicyVersion" in command ? command.expectedPolicyVersion : undefined,
    );
    let change: Omit<WbsGovernanceChange, "at">;
    if (command.action === "set-policy") {
      change = {
        version,
        policy: changeWbsPolicy(state.policy, command.minimumApprovals, command.allowSelfApproval),
      };
    } else {
      const item =
        command.action === "create-proposal"
          ? null
          : await transaction.loadProposal(command.proposalId);
      if (command.action !== "create-proposal") {
        if (!item) throw new WbsError(404, "找不到此 Repository 的提案。");
        assertOpenWbsProposal(item, command.expectedProposalVersion);
      }
      if (command.action === "create-proposal" || command.action === "revise-proposal") {
        const candidate = await transaction.loadRevision(command.candidateRevisionId);
        const baseline = state.baselineId ? await transaction.loadBaseline(state.baselineId) : null;
        const previous = baseline ? await transaction.loadRevision(baseline.revisionId) : null;
        assertWbsCandidate(
          command.baseBaselineId,
          state.baselineId,
          candidate.document,
          previous?.document ?? null,
        );
        const content = {
          title: command.title,
          reason: command.reason,
          candidateRevisionId: command.candidateRevisionId,
          baseBaselineId: command.baseBaselineId,
        };
        change = {
          version,
          proposal: item
            ? reviseWbsProposal(item, content, userId, now)
            : proposeWbsScope(content, transaction.nextId(), version, userId, now),
        };
      } else {
        if (!item) throw new WbsError(404, "找不到此 Repository 的提案。");
        if (command.action === "close-proposal") {
          change = { version, proposal: finishWbsProposal(item, "CLOSED", userId, now) };
        } else if (command.action === "review-proposal") {
          change = {
            version,
            review: {
              proposalId: item.id,
              value: reviewWbsScope(item, state.policy, userId, {
                id: transaction.nextId(),
                decision: command.decision,
                note: command.note,
                sequence: version,
                at: now,
              }),
            },
          };
        } else {
          const candidate = await transaction.loadRevision(item.candidateRevisionId);
          const reviews = await transaction.loadReviews(item, state.policy);
          const baseline = publishWbsScope(
            item,
            state,
            candidate.document,
            reviews,
            transaction.nextId(),
            version,
            userId,
            now,
          );
          change = {
            version,
            baseline,
            proposal: finishWbsProposal(item, "PUBLISHED", userId, now),
          };
        }
      }
    }
    return transaction.save({ ...change, at: now });
  });
}

export function createWbsGovernance(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): WbsGovernanceStore;
  now(): number;
}) {
  return {
    async view(subject: string, selector: RepositorySelector, query: WbsGovernanceQuery = {}) {
      const parsed = parseWbsGovernanceQuery(query);
      return deps.store().view((await deps.activeUser(subject)).id, selector, parsed);
    },
    async execute(subject: string, input: unknown) {
      const command = parseWbsGovernanceCommand(input);
      return executeWbsGovernanceCommand(
        deps.store(),
        (await deps.activeUser(subject)).id,
        command,
        deps.now(),
      );
    },
  };
}
