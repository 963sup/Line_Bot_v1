import type { Workplace, WorkplaceCommand } from "../../domain.js";

type WorkplacePage = {
  canCreate: boolean;
  sites: Workplace[];
  next: string | null;
  members: { id: string; status: string }[];
};
export interface WorkplaceStore {
  read(actor: string, id: string, after: string): Promise<WorkplacePage>;
  change(
    actor: string,
    command: WorkplaceCommand,
    now: number,
  ): Promise<{ id: string; version: number }>;
}
