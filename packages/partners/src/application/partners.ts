import type { PartnerMutationTransactions } from "../contracts/output/partner-mutations.js";
import type { PartnerCursor, PartnerRepository } from "../contracts/repositories/partners.js";
import type { PartnerView } from "../contracts.js";
import { PartnerError } from "../domain.js";
import { parsePartnerCommand } from "./commands/partner-command.js";
import { executePartnerCommand } from "./use-cases/partner-mutations.js";

export function createPartners(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  repository(): PartnerRepository;
  mutations(): PartnerMutationTransactions;
  now(): number;
}) {
  return {
    async view(subject: string, view?: PartnerView, after?: string) {
      const user = await deps.activeUser(subject);
      let cursor: PartnerCursor | undefined;
      if (after !== undefined) {
        try {
          if ((view !== "directory" && view !== "manage") || after.length > 1000) throw new Error();
          const parsed = JSON.parse(after);
          if (
            !parsed ||
            typeof parsed.name !== "string" ||
            parsed.name.length > 200 ||
            typeof parsed.id !== "string" ||
            !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(parsed.id)
          )
            throw new Error();
          cursor = { name: parsed.name, id: parsed.id };
        } catch {
          throw new PartnerError(400, "名錄分頁不正確，請重新讀取。");
        }
      }
      return deps.repository().view(user.id, view, cursor);
    },
    async execute(subject: string, raw: unknown) {
      const user = await deps.activeUser(subject);
      return executePartnerCommand(deps.mutations(), user.id, parsePartnerCommand(raw), deps.now());
    },
  };
}
