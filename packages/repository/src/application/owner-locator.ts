import { normalizeAccountLogin } from "@line-work/account/domain/login";

/**
 * RepositoryOwner is Account-owned (User | Organization).
 * Map Account's exception-based normalization to Repository selector semantics without
 * taking ownership of the login policy.
 */
export function accountLoginForRepositoryLocator(value: string): string | null {
  try {
    return normalizeAccountLogin(value);
  } catch {
    return null;
  }
}
