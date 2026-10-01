export type { Issue, IssueAction, IssueStatus } from "./domain/issue/entities/issue.js";
export { IssueError } from "./domain/issue/errors/issue-error.js";
export { transitionIssue } from "./domain/issue/policies/issue-transition.js";
export {
  canCommentOnIssue,
  canManageIssueWork,
  canOpenIssue,
  canReadIssueScope,
  canUseIssueOperation,
  type IssueRepositoryOperation,
} from "./domain/issue/policies/repository-issue-operation.js";
export { normalizeIssueNumber } from "./domain/issue/value-objects/issue-number.js";
export { issueText } from "./domain/issue/value-objects/issue-text.js";
