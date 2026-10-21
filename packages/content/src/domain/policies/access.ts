export function canEditContent(permissions: readonly string[]) {
  return permissions.some(
    (permission) => permission === "write" || permission === "maintain" || permission === "admin",
  );
}
