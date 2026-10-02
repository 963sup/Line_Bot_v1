import type { RepositoryLabel, RepositoryMilestone } from "../dto/resources.js";

type RepositoryResourceCommandBase = Readonly<{
  requestId: string;
  repositoryId: string;
  expectedVersion: number;
}>;

export type RepositoryResourceManagementCommand =
  | (RepositoryResourceCommandBase & {
      action: "create-label";
      name: string;
      color: string;
      description: string;
    })
  | (RepositoryResourceCommandBase & {
      action: "update-label";
      labelId: string;
      name?: string;
      color?: string;
      description?: string;
    })
  | (RepositoryResourceCommandBase & {
      action: "delete-label";
      labelId: string;
    })
  | (RepositoryResourceCommandBase & {
      action: "create-milestone";
      title: string;
      description: string;
      dueAt: number | null;
    })
  | (RepositoryResourceCommandBase & {
      action: "update-milestone";
      milestoneId: string;
      title?: string;
      description?: string;
      dueAt?: number | null;
    })
  | (RepositoryResourceCommandBase & {
      action: "open-milestone" | "close-milestone";
      milestoneId: string;
    });

export type RepositoryResourceManagementReceipt =
  | Readonly<{
      requestId: string;
      repositoryId: string;
      action: "create-label" | "update-label" | "delete-label";
      label: RepositoryLabel;
      deleted: boolean;
      at: number;
    }>
  | Readonly<{
      requestId: string;
      repositoryId: string;
      action: "create-milestone" | "update-milestone" | "open-milestone" | "close-milestone";
      milestone: RepositoryMilestone;
      at: number;
    }>;

export interface RepositoryResourceManagementStore {
  execute(
    userId: string,
    command: RepositoryResourceManagementCommand,
    now: number,
  ): Promise<RepositoryResourceManagementReceipt>;
}
