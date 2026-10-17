import type { WbsRevision } from "../../domain/content.js";
import type { ProjectWbsRole } from "../../domain/policies/project-access.js";
import type {
  ProjectWbsCommand,
  ProjectWbsHistory,
  ProjectWbsReceipt,
  ProjectWbsView,
} from "../dto/project-content.js";

export type ProjectWbsWriteScope = Readonly<{
  projectId: string;
  closed: boolean;
  role: ProjectWbsRole;
}>;
export interface ProjectWbsContentTransaction {
  readonly scope: ProjectWbsWriteScope;
  replay(): Promise<ProjectWbsReceipt | null>;
  load(): Promise<WbsRevision | null>;
  nextId(): string;
  save(revision: WbsRevision): Promise<ProjectWbsReceipt>;
}
export interface ProjectWbsStore {
  read(
    userId: string,
    selector: { projectId: string },
    revisionId?: string,
  ): Promise<ProjectWbsView>;
  history(
    userId: string,
    selector: { projectId: string },
    before?: number,
  ): Promise<ProjectWbsHistory>;
  transact<T>(
    userId: string,
    command: ProjectWbsCommand,
    operation: (transaction: ProjectWbsContentTransaction) => Promise<T>,
  ): Promise<T>;
}
