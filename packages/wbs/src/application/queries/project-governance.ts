import type { ProjectWbsGovernanceQuery } from "../../contracts/dto/project-governance.js";
import { WbsError } from "../../domain/document.js";

export function parseProjectWbsGovernanceQuery(
  query: ProjectWbsGovernanceQuery,
): ProjectWbsGovernanceQuery {
  for (const value of [query.proposalId, query.baselineId])
    if (value !== undefined && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value))
      throw new WbsError(400, "治理識別碼不正確。");
  for (const value of [
    query.proposalVersion,
    query.beforeReview,
    query.beforeProposal,
    query.beforeBaseline,
  ])
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1 || value > 2147483647))
      throw new WbsError(400, "治理版本不正確。");
  if (
    (query.proposalVersion !== undefined || query.beforeReview !== undefined) &&
    !query.proposalId
  )
    throw new WbsError(400, "提案歷史查詢需要 proposalId。");
  return {
    ...(query.proposalVersion === undefined ? {} : { proposalVersion: query.proposalVersion }),
    ...(query.beforeReview === undefined ? {} : { beforeReview: query.beforeReview }),
    ...(query.beforeProposal === undefined ? {} : { beforeProposal: query.beforeProposal }),
    ...(query.beforeBaseline === undefined ? {} : { beforeBaseline: query.beforeBaseline }),
    ...(query.proposalId === undefined ? {} : { proposalId: query.proposalId.toLowerCase() }),
    ...(query.baselineId === undefined ? {} : { baselineId: query.baselineId.toLowerCase() }),
  };
}
