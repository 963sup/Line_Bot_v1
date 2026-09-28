import type { PermissionView } from "@line_bot_v1/identity-access/contracts/permissions";

export async function requestPermissions(proof: string): Promise<PermissionView> {
  const response = await fetch("/api/permissions", {
    cache: "no-store",
    headers: { "x-line-token": proof },
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
