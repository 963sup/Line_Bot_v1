import type { Enterprise } from "../../domain.js";

export interface EnterpriseLifecycleRepository {
  load(): Promise<Enterprise>;
  save(next: Enterprise, expectedVersion: number): Promise<void>;
}
