export type {
  Discussion,
  DiscussionCloseReason,
  DiscussionComment,
  DiscussionLockReason,
  DiscussionSummary,
} from "./domain/discussion/entities/discussion.js";
export { DiscussionError } from "./domain/discussion/errors/discussion-error.js";
export { canDiscussionRepositoryOperation } from "./domain/discussion/policies/discussion-repository-operation.js";
export { normalizeDiscussionId } from "./domain/discussion/value-objects/discussion-id.js";
export { normalizeDiscussionNumber } from "./domain/discussion/value-objects/discussion-number.js";
