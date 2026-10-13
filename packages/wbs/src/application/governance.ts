import type { RepositorySelector } from "@line_bot_v1/repository/contracts/selectors";
import type {
  WbsGovernanceCommand,
  WbsGovernanceQuery,
  WbsGovernanceStore,
} from "../contracts/governance.js";
import { WbsError } from "../domain.js";

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
function id(value: unknown): string {
  if (typeof value !== "string" || !uuid.test(value)) throw new WbsError(400, "治理識別碼不正確。");
  return value.toLowerCase();
}
function version(value: unknown, minimum = 1): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > 2147483647
  )
    throw new WbsError(400, "治理版本不正確。");
  return value;
}
function text(value: unknown, maximum: number, required = false): string {
  if (typeof value !== "string" || value.length > maximum || (required && !value.trim()))
    throw new WbsError(400, "治理文字格式不正確。");
  return value.trim();
}
export function parseWbsGovernanceCommand(input: unknown): WbsGovernanceCommand {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new WbsError(400, "治理操作格式不正確。");
  const v: Record<string, unknown> = { ...input };
  if (typeof v.repositoryId !== "string" || !v.repositoryId || v.repositoryId.length > 128)
    throw new WbsError(400, "Repository 識別碼不正確。");
  const base = {
    requestId: id(v.requestId),
    repositoryId: v.repositoryId,
    expectedVersion: version(v.expectedVersion, 0),
  };
  let result: WbsGovernanceCommand;
  if (v.action === "set-policy") {
    const minimumApprovals = version(v.minimumApprovals);
    if (minimumApprovals > 10 || typeof v.allowSelfApproval !== "boolean")
      throw new WbsError(400, "審查政策不正確。");
    result = {
      ...base,
      action: v.action,
      expectedPolicyVersion: version(v.expectedPolicyVersion),
      minimumApprovals,
      allowSelfApproval: v.allowSelfApproval,
    };
  } else if (v.action === "create-proposal" || v.action === "revise-proposal") {
    const fields = {
      title: text(v.title, 200, true),
      reason: text(v.reason, 10000),
      candidateRevisionId: id(v.candidateRevisionId),
      baseBaselineId: v.baseBaselineId === null ? null : id(v.baseBaselineId),
    };
    result =
      v.action === "create-proposal"
        ? { ...base, action: v.action, ...fields }
        : {
            ...base,
            action: v.action,
            ...fields,
            proposalId: id(v.proposalId),
            expectedProposalVersion: version(v.expectedProposalVersion),
          };
  } else {
    const proposal = {
      ...base,
      proposalId: id(v.proposalId),
      expectedProposalVersion: version(v.expectedProposalVersion),
    };
    if (v.action === "close-proposal") result = { ...proposal, action: v.action };
    else if (v.action === "publish-proposal")
      result = {
        ...proposal,
        action: v.action,
        expectedPolicyVersion: version(v.expectedPolicyVersion),
      };
    else if (v.action === "review-proposal") {
      if (v.decision !== "APPROVE" && v.decision !== "REQUEST_CHANGES")
        throw new WbsError(400, "審查決定不正確。");
      result = {
        ...proposal,
        action: v.action,
        expectedPolicyVersion: version(v.expectedPolicyVersion),
        decision: v.decision,
        note: text(v.note, 2000),
      };
    } else throw new WbsError(400, "未知治理操作。");
  }
  if (Object.keys(v).some((key) => !Object.hasOwn(result, key)))
    throw new WbsError(400, "治理操作包含未知欄位。");
  return result;
}
export function createWbsGovernance(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): WbsGovernanceStore;
  now(): number;
}) {
  return {
    async view(subject: string, selector: RepositorySelector, query: WbsGovernanceQuery = {}) {
      const parsed: WbsGovernanceQuery = {
        ...(query.proposalVersion === undefined
          ? {}
          : { proposalVersion: version(query.proposalVersion) }),
        ...(query.beforeReview === undefined ? {} : { beforeReview: version(query.beforeReview) }),
        ...(query.proposalId === undefined ? {} : { proposalId: id(query.proposalId) }),
        ...(query.baselineId === undefined ? {} : { baselineId: id(query.baselineId) }),
        ...(query.beforeProposal === undefined
          ? {}
          : { beforeProposal: version(query.beforeProposal) }),
        ...(query.beforeBaseline === undefined
          ? {}
          : { beforeBaseline: version(query.beforeBaseline) }),
      };
      if (
        (parsed.proposalVersion !== undefined || parsed.beforeReview !== undefined) &&
        !parsed.proposalId
      )
        throw new WbsError(400, "提案歷史查詢需要 proposalId。");
      return deps.store().view((await deps.activeUser(subject)).id, selector, parsed);
    },
    async execute(subject: string, input: unknown) {
      const command = parseWbsGovernanceCommand(input);
      return deps.store().execute((await deps.activeUser(subject)).id, command, deps.now());
    },
  };
}
