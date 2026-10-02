import type {
  RepositoryLabel,
  RepositoryMilestone,
  RepositoryMilestoneStatus,
} from "../../contracts/dto/resources.js";
import type { RepositorySelector } from "../../contracts/selectors.js";
import type { RepositorySummary } from "../../domain.js";

export type { RepositoryLabel, RepositoryMilestone, RepositoryMilestoneStatus };

export type RepositoryResourceIdentity = { userId: string };

export type RepositoryLabelCursor = { name: string; id: string };
export type RepositoryMilestoneCursor = { number: number; id: string };

export type RepositoryLabelsResult = {
  repository: RepositorySummary;
  labels: RepositoryLabel[];
  next: string | null;
};

export type RepositoryMilestonesResult = {
  repository: RepositorySummary;
  milestones: RepositoryMilestone[];
  next: string | null;
};

export type RepositoryMilestoneResult = {
  repository: RepositorySummary;
  milestone: RepositoryMilestone;
};

export interface RepositoryResourceStore {
  labels(
    identity: RepositoryResourceIdentity,
    selector: RepositorySelector,
    after?: RepositoryLabelCursor,
  ): Promise<RepositoryLabelsResult>;
  milestones(
    identity: RepositoryResourceIdentity,
    selector: RepositorySelector,
    status?: RepositoryMilestoneStatus,
    after?: RepositoryMilestoneCursor,
  ): Promise<RepositoryMilestonesResult>;
  milestone(
    identity: RepositoryResourceIdentity,
    selector: RepositorySelector,
    number: number,
  ): Promise<RepositoryMilestoneResult>;
}
