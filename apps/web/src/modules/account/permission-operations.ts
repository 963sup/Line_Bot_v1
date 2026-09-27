import type { PermissionView } from "@line-work/identity-access/contracts/permissions";
import type { PermissionCommand } from "@line-work/identity-access/domain/permission";

const storageKey = "permission-operation";

export type PendingPermissionOperation = {
  owner: string;
  command: PermissionCommand;
};

export async function requestPermissions(
  proof: string,
  id = "",
  command?: PermissionCommand,
): Promise<PermissionView & { requestId?: string; version?: number }> {
  const response = await fetch("/api/permissions?target=" + encodeURIComponent(id), {
    method: command ? "POST" : "GET",
    cache: "no-store",
    headers: {
      "x-line-token": proof,
      ...(command ? { "Content-Type": "application/json" } : {}),
    },
    body: command ? JSON.stringify(command) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const value = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(value.error ?? "權限服務暫不可用。"), {
      status: response.status,
    });
  }
  return value;
}

export function restorePendingPermissionOperation(
  storage: Pick<Storage, "getItem" | "removeItem">,
  owner: string,
): PendingPermissionOperation | null {
  const saved = storage.getItem(storageKey);
  const operation: PendingPermissionOperation | null = saved ? JSON.parse(saved) : null;
  if (operation?.owner === owner) return operation;
  storage.removeItem(storageKey);
  return null;
}

export function savePendingPermissionOperation(
  storage: Pick<Storage, "setItem">,
  operation: PendingPermissionOperation,
) {
  storage.setItem(storageKey, JSON.stringify(operation));
}

export function clearPendingPermissionOperation(storage: Pick<Storage, "removeItem">) {
  storage.removeItem(storageKey);
}
