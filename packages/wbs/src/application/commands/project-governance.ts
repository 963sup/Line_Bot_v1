import type { ProjectWbsGovernanceCommand } from "../../contracts/dto/project-governance.js";
import { WbsError } from "../../domain/document.js";

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
export function parseProjectWbsGovernanceCommand(input: unknown): ProjectWbsGovernanceCommand {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new WbsError(400, "治理操作格式不正確。");
  const v: Record<string, unknown> = { ...input };
  if (typeof v.projectId !== "string" || !v.projectId || v.projectId.length > 128)
    throw new WbsError(400, "Project 識別碼不正確。");
  const base = {
    requestId: id(v.requestId),
    projectId: v.projectId,
    expectedVersion: version(v.expectedVersion, 0),
  };
  let result: ProjectWbsGovernanceCommand;
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
