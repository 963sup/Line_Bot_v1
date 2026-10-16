export { normalizeRepositoryMilestoneNumber } from "../domain/milestone/value-objects/milestone-number.js";
export type {
  RepositoryAddress,
  RepositorySummary,
  RepositoryVisibility,
} from "../domain/repository/entities/repository.js";
export {
  hasRepositoryPermission,
  type RepositoryPermission,
  repositoryPermissions,
} from "../domain/repository/value-objects/repository-capability.js";
export { normalizeRepositoryName } from "../domain/repository/value-objects/repository-name.js";
export { normalizeRepositoryStarListDescription } from "../domain/star-list/value-objects/star-list-description.js";
export { normalizeRepositoryStarListName } from "../domain/star-list/value-objects/star-list-name.js";

export class RepositoryError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}
