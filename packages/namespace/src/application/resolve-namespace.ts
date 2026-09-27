import type { NamespaceStore } from "../contracts/namespace.js";
import { NamespaceError, normalizeAccountLogin } from "../domain/namespace.js";

export async function resolveNamespace(store: NamespaceStore, raw: unknown) {
  try {
    return await store.resolve(normalizeAccountLogin(raw));
  } catch (error) {
    if (error instanceof NamespaceError && error.status === 400) return null;
    throw error;
  }
}
