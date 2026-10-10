"use client";

import { ensureCurrentAccount } from "./current-account";
import { type ProfileResolution, resolveProfileDestination } from "./profile-destination";
import { clearVerifiedProfileEntry, rememberVerifiedProfileEntry } from "./profile-entry-handoff";

export type ProfileEntryResolution = ProfileResolution | { kind: "waiting" };

/**
 * Resolves the current verified LINE User to the canonical Profile route.
 * The server remains identity authority; the document-local handoff only removes a duplicate read.
 */
export async function resolveVerifiedProfileEntry(
  liffId: string,
  signal?: AbortSignal,
): Promise<ProfileEntryResolution> {
  clearVerifiedProfileEntry();
  const current = await ensureCurrentAccount(liffId, signal);
  if (!current) return { kind: "waiting" };

  const { member, token } = current;
  const result = resolveProfileDestination(member);
  if (
    result.kind === "redirect" &&
    member?.status === "active" &&
    typeof member.id === "string" &&
    typeof member.login === "string"
  ) {
    rememberVerifiedProfileEntry({ userId: member.id, login: member.login, token });
  }
  return result;
}
