import type { GovernanceAuditEvent } from "@line_bot_v1/identity-access/contracts/audit";

type AuditCursor = Readonly<{ at: number; id: string }>;

export type AuditResult =
  | { ok: true; events: GovernanceAuditEvent[]; next: string | null }
  | { ok: false; error: "invalid-input" | "forbidden" };

export function parseAuditCursor(value: string): AuditCursor | null {
  const match = /^(0|[1-9]\d{0,15}):([1-9]\d{0,18})$/.exec(value);
  if (!match) return null;
  const [, timestamp, id] = match;
  if (timestamp === undefined || id === undefined) return null;
  const at = Number(timestamp);
  if (!Number.isSafeInteger(at) || BigInt(id) > 9223372036854775807n) return null;
  return { at, id };
}
