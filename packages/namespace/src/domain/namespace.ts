import { isReservedRootNamespaceKey } from "./root.js";

export type NamespaceKind = "USER" | "ORGANIZATION";

export type NamespaceTarget = Readonly<{
  id: string;
  kind: NamespaceKind;
}>;

export type NamespaceBinding = NamespaceTarget & Readonly<{ login: string }>;

export class NamespaceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function normalizeAccountLogin(value: unknown): string {
  if (typeof value !== "string") throw new NamespaceError(400, "Account login is invalid.");
  const login = value.trim().toLowerCase();
  if (
    login.length < 1 ||
    login.length > 39 ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(login) ||
    isReservedRootNamespaceKey(login)
  ) {
    throw new NamespaceError(400, "Account login is invalid or reserved.");
  }
  return login;
}
