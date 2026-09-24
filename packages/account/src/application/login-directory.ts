import { normalizeAccountLogin } from "../domain/login.js";
import type { LoginDirectoryStore } from "./ports/login-directory.js";

export function createLoginDirectory(store: () => LoginDirectoryStore) {
  return {
    async resolve(value: string) {
      try {
        return store().resolve(normalizeAccountLogin(value));
      } catch {
        return null;
      }
    },
  };
}
