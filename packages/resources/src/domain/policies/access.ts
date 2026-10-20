export function canEditObject(permissions: readonly string[]) {
  return permissions.some(
    (value) => value === "write" || value === "maintain" || value === "admin",
  );
}

export function canManageObjectTypes(permissions: readonly string[]) {
  return permissions.includes("admin");
}
