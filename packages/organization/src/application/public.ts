import { normalizeAccountLogin } from "@line-work/account/domain/login";
import type { OrganizationPublicStore } from "./ports/public.js";

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
