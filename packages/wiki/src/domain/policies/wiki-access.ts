export function canEditWiki(permissions: readonly string[]) {
  return permissions.some((p) => p === "write" || p === "maintain" || p === "admin");
}
