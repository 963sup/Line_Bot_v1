export function canEditWbs(permissions: readonly string[]) {
  return permissions.some(
    (permission) => permission === "write" || permission === "maintain" || permission === "admin",
  );
}

export function canReviewWbs(permissions: readonly string[]) {
  return permissions.some((permission) => permission === "maintain" || permission === "admin");
}

export function canGovernWbs(permissions: readonly string[], action: string) {
  return action === "set-policy"
    ? permissions.includes("admin")
    : action === "review-proposal" || action === "publish-proposal"
      ? canReviewWbs(permissions)
      : canEditWbs(permissions);
}
