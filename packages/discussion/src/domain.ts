export type {
  Discussion,
  DiscussionCloseReason,
  DiscussionComment,
  DiscussionLockReason,
  DiscussionState,
  DiscussionStateReason,
  DiscussionSummary,
} from "./domain/discussion/entities/discussion.js";
export { DiscussionError } from "./domain/discussion/errors/discussion-error.js";
export { normalizeDiscussionId } from "./domain/discussion/value-objects/discussion-id.js";
export {
  canDiscussionRepositoryOperation,
  type DiscussionRepositoryOperation,
} from "./domain/discussion/policies/discussion-repository-operation.js";
export { normalizeDiscussionNumber } from "./domain/discussion/value-objects/discussion-number.js";
