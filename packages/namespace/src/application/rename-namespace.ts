import type { NamespaceStore } from "../contracts/namespace.js";
import { type NamespaceTarget, normalizeAccountLogin } from "../domain/namespace.js";

export function renameNamespace(
  store: NamespaceStore,
  target: NamespaceTarget,
  expectedLogin: unknown,
  login: unknown,
  at: number,
) {
  return store.rename(
    target,
    normalizeAccountLogin(expectedLogin),
    normalizeAccountLogin(login),
    at,
  );
}
