import { IssueError } from "../errors/issue-error.js";

export type IssueObjectReferenceChange = Readonly<{
  previousRevisionId: string | null;
  revisionId: string;
}>;

export function changeIssueObjectReference(
  previousRevisionId: string | null,
  revisionId: string,
): IssueObjectReferenceChange {
  if (previousRevisionId === revisionId) {
    throw new IssueError(409, "Issue Object reference 沒有變更。");
  }
  return { previousRevisionId, revisionId };
}

export function removeIssueObjectReference(revisionId: string | null) {
  if (revisionId === null) throw new IssueError(409, "Issue Object reference 不存在。");
  return { removedRevisionId: revisionId } as const;
}
