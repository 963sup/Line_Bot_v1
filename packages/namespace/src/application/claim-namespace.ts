import type { NamespaceStore } from "../contracts/namespace.js";
import { type NamespaceTarget, normalizeAccountLogin } from "../domain/namespace.js";

export function claimNamespace(
  store: NamespaceStore,
  target: NamespaceTarget,
  login: unknown,
  at: number,
) {
  return store.claim(target, normalizeAccountLogin(login), at);
}
