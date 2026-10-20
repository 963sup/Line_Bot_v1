export function canSubmitExecution(permissions: readonly string[]) {
  return permissions.some(
    (permission) => permission === "write" || permission === "maintain" || permission === "admin",
  );
}

export function canReviewExecution(permissions: readonly string[]) {
  return permissions.includes("admin");
}
