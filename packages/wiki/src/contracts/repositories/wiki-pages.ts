import type { WikiRevision } from "../../domain/wiki-page.js";
export interface WikiPages {
  load(): Promise<WikiRevision | null>;
  revision(id: string): Promise<WikiRevision | null>;
  save(next: WikiRevision, expectedVersion: number): Promise<void>;
}
