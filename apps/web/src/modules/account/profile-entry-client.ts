"use client";

import { liffClient } from "../../shared/browser/liff-client";
import {
  type ProfileAccount,
  type ProfileResolution,
  resolveProfileDestination,
} from "./profile-destination";
import { clearVerifiedProfileEntry, rememberVerifiedProfileEntry } from "./profile-entry-handoff";

type AccountProjection = {
  member?: (ProfileAccount & { id?: string | null }) | null;
};

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
  const token = await liffClient.session(liffId);
  if (!token) return { kind: "waiting" };

  const response = await fetch("/api/membership?view=account", {
    headers: { "x-line-token": token },
    cache: "no-store",
    signal,
  });
  if (!response.ok) return { kind: "unavailable" };

  const value = (await response.json()) as AccountProjection;
  signal?.throwIfAborted();
  const member = value.member ?? null;
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
