"use client";

import type { UserUseCases } from "@line_bot_v1/account/application/user";
import { liffClient } from "../../shared/browser/liff-client";
import type { AppSessionGeneration } from "../../shared/browser/line-service-session";

type CurrentAccount = NonNullable<Awaited<ReturnType<UserUseCases["getUser"]>>>;
export type CurrentAccountSession = Readonly<{
  token: AppSessionGeneration;
  member: CurrentAccount | null;
}>;

type PendingRequest = {
  token: AppSessionGeneration;
  controller: AbortController;
  promise: Promise<CurrentAccountSession>;
};

let cached: CurrentAccountSession | undefined;
let pending: PendingRequest | undefined;

function readError(value: unknown) {
  return value && typeof value === "object" && "error" in value && typeof value.error === "string"
    ? value.error
    : "會員資料讀取失敗。";
}

function readMember(value: unknown): CurrentAccount | null {
  if (!value || typeof value !== "object" || !("member" in value)) {
    throw new Error("會員資料回應格式不正確。");
  }
  const member = value.member;
  if (member !== null && (typeof member !== "object" || Array.isArray(member))) {
    throw new Error("會員資料回應格式不正確。");
  }
  return member as CurrentAccount | null;
}

/**
 * Account projection is a document-local read optimization, never an authority cache.
 * The server response remains authoritative and is keyed by the current app-session generation.
 */
export function clearCurrentAccount() {
  pending?.controller.abort();
  pending = undefined;
  cached = undefined;
}

export async function readCurrentAccount(
  token: AppSessionGeneration,
  signal?: AbortSignal,
): Promise<CurrentAccountSession> {
  signal?.throwIfAborted();
  if (cached?.token === token) return cached;

  if (pending) {
    if (pending.token === token) {
      const result = await pending.promise;
      signal?.throwIfAborted();
      return result;
    }
    await pending.promise.catch(() => undefined);
    signal?.throwIfAborted();
    if (cached?.token === token) return cached;
  }

  const controller = new AbortController();
  const promise = (async () => {
    const response = await fetch("/api/membership?view=account", {
      headers: { "X-App-Session-Generation": token },
      cache: "no-store",
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => undefined)) as unknown;
    if (!response.ok) throw new Error(readError(body));
    const result = { token, member: readMember(body) } satisfies CurrentAccountSession;
    cached = result;
    return result;
  })();

  pending = { token, controller, promise };
  try {
    const result = await promise;
    signal?.throwIfAborted();
    return result;
  } finally {
    if (pending?.promise === promise) pending = undefined;
  }
}

/** Establishes the service session once, then reads the verified Account projection once. */
export async function ensureCurrentAccount(
  liffId: string,
  signal?: AbortSignal,
): Promise<CurrentAccountSession | null> {
  const token = await liffClient.ensureSession(liffId);
  signal?.throwIfAborted();
  if (!token) return null;
  return readCurrentAccount(token, signal);
}

liffClient.onSessionBlocked(() => clearCurrentAccount());
