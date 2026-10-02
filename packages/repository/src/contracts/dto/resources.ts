export type RepositoryLabel = {
  id: string;
  repositoryId: string;
  name: string;
  color: string;
  description: string;
  version: number;
};

export type RepositoryMilestoneStatus = "open" | "closed";

export type RepositoryMilestone = {
  id: string;
  repositoryId: string;
  number: number;
  title: string;
  description: string;
  status: RepositoryMilestoneStatus;
  dueAt: number | null;
  version: number;
  createdAt: number;
  updatedAt: number;
};
