export type ProjectWbsRole = "READ" | "WRITE" | "ADMIN";

export function canEditProjectWbs(role: ProjectWbsRole) {
  return role === "WRITE" || role === "ADMIN";
}

export function canReviewProjectWbs(role: ProjectWbsRole) {
  return role === "WRITE" || role === "ADMIN";
}

export function canGovernProjectWbs(role: ProjectWbsRole, action: string) {
  return action === "set-policy" || action === "publish-proposal"
    ? role === "ADMIN"
    : action === "review-proposal"
      ? canReviewProjectWbs(role)
      : canEditProjectWbs(role);
}
