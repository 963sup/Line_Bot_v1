import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import type { OrganizationPublicStore } from "../contracts/output/public.js";

export function createPublicOrganizations(store: OrganizationPublicStore) {
  return {
    async byLogin(login: string) {
      try {
        return store.byLogin(normalizeAccountLogin(login));
      } catch {
        return null;
      }
    },
  };
}
