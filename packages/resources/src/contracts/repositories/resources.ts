import type { ResourceRevision } from "../../domain/resource.js";

export interface Resources {
  load(): Promise<ResourceRevision | null>;
  save(next: ResourceRevision, expectedVersion: number): Promise<void>;
}
