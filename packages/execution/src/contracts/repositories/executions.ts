import type { ExecutionRevision } from "../../domain/execution.js";

export interface Executions {
  load(): Promise<ExecutionRevision | null>;
  save(next: ExecutionRevision, expectedVersion: number): Promise<void>;
}
