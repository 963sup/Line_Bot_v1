export function canEditContract(permissions: readonly string[]) {
  return permissions.some(
    (permission) => permission === "write" || permission === "maintain" || permission === "admin",
  );
}

export function canAdminContract(permissions: readonly string[]) {
  return permissions.includes("admin");
}
