import { buildNamespacePath } from "@line_bot_v1/namespace";
export type ProfileAccount = Readonly<{
  login?: string | null;
  status?: string | null;
}>;

export type ProfileResolution =
  | { kind: "redirect"; href: string }
  | { kind: "integrity-unavailable" }
  | { kind: "suspended" }
  | { kind: "unavailable" };

/** Maps the verified Account projection to the only valid Profile destination. */
export function resolveProfileDestination(member: ProfileAccount | null): ProfileResolution {
  if (!member) return { kind: "redirect", href: "/membership/register" };
  if (member.status === "paused") return { kind: "redirect", href: "/membership/restore" };
  if (member.status === "suspended") return { kind: "suspended" };
  if (member.status !== "active") return { kind: "unavailable" };
  if (typeof member.login !== "string" || member.login.length === 0) {
    return { kind: "integrity-unavailable" };
  }
  return { kind: "redirect", href: buildNamespacePath("account", { login: member.login }) };
}
