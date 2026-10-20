import type { ContractRevision } from "../../domain/contract.js";

export interface Contracts {
  load(): Promise<ContractRevision | null>;
  save(next: ContractRevision, expectedVersion: number): Promise<void>;
}
