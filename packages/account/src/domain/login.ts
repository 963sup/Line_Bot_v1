class AccountLoginError extends Error {}

const reservedLogins = new Set([
  "admin",
  "api",
  "attendance",
  "auth",
  "complete",
  "diary",
  "enterprises",
  "expenses",
  "explore",
  "feedback",
  "google-link",
  "history",
  "home",
  "login",
  "membership",
  "notifications",
  "organizations",
  "orgs",
  "partners",
  "planned",
  "privacy",
  "projects",
  "repositories",
  "search",
  "settings",
  "team",
  "terms",
  "unavailable",
]);

export function normalizeAccountLogin(value: string): string {
  const login = value.trim().toLowerCase();
  if (
    login.length < 1 ||
    login.length > 39 ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(login) ||
    reservedLogins.has(login)
  ) {
    throw new AccountLoginError("Account login is invalid or reserved.");
  }
  return login;
}
