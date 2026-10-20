import type {
  ProjectLifecycleAction,
  ProjectLifecycleChange,
  ProjectLifecycleState,
} from "../../domain/project-lifecycle.js";
import type { ProjectAccessRole } from "../../domain.js";
import type {
  ProjectManagementCommand,
  ProjectManagementIdentity,
  ProjectManagementReceipt,
} from "../management.js";

export type ProjectLifecycleCommand = Extract<
  ProjectManagementCommand,
  { action: ProjectLifecycleAction }
>;

export interface ProjectLifecycleTransaction {
  replay(): Promise<ProjectManagementReceipt | null>;
  load(): Promise<{ state: ProjectLifecycleState; role: ProjectAccessRole }>;
  save(change: ProjectLifecycleChange, now: number): Promise<ProjectManagementReceipt>;
}

export interface ProjectLifecyclePersistence {
  transact<T>(
    identity: ProjectManagementIdentity,
    command: ProjectLifecycleCommand,
    operation: (transaction: ProjectLifecycleTransaction) => Promise<T>,
  ): Promise<T>;
}
