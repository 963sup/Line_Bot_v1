import type { Organization } from "../../domain.js";

export interface OrganizationLifecycleRepository {
  load(): Promise<Organization>;
  save(next: Organization, expectedVersion: number): Promise<void>;
}
