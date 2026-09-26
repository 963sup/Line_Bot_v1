import { isReservedRootNamespaceKey } from "@line-work/namespace/root";

class AccountLoginError extends Error {}

export function normalizeAccountLogin(value: string): string {
  const login = value.trim().toLowerCase();
  if (
    login.length < 1 ||
    login.length > 39 ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(login) ||
    isReservedRootNamespaceKey(login)
  ) {
    throw new AccountLoginError("Account login is invalid or reserved.");
  }
  return login;
}
