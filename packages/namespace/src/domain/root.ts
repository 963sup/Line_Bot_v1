/**
 * Canonical shared reservation policy for the application's global first path segment.
 *
 * Namespace owns normalization, reservation, and collision for the global Account locator.
 */
export const ROOT_NAMESPACE_RESERVED_KEYS = [
  "admin",
  "api",
  "assistant",
  "attendance",
  "auth",
  "complete",
  "daily-check-in",
  "diary",
  "enterprises",
  "expenses",
  "explore",
  "feedback",
  "google-link",
  "history",
  "home",
  "issues",
  "login",
  "membership",
  "notifications",
  "organizations",
  "orgs",
  "partners",
  "planned",
  "privacy",
  "profile",
  "projects",
  "pulls",
  "repositories",
  "search",
  "settings",
  "sponsors",
  "stars",
  "team",
  "terms",
  "trending",
  "unavailable",
] as const;

export type RootNamespaceReservedKey = (typeof ROOT_NAMESPACE_RESERVED_KEYS)[number];

const reservedRootKeys = new Set<string>(ROOT_NAMESPACE_RESERVED_KEYS);

/**
 * Expects a key already normalized by its owning Domain.
 * This function does not normalize, authorize, resolve, or persist a Subject.
 */
export function isReservedRootNamespaceKey(key: string): key is RootNamespaceReservedKey {
  return reservedRootKeys.has(key);
}
