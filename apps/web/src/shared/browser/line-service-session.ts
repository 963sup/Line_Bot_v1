"use client";

export type AppSessionGeneration = string & { readonly __appSessionGeneration: unique symbol };
export type SessionBlockReason = "signed-out" | "session-changed";

export class SessionBlockedError extends Error {
  constructor(readonly reason: SessionBlockReason) {
    super(
      reason === "signed-out"
        ? "你已登出此服務，請選擇「使用 LINE 重新登入」。"
        : "登入狀態已在其他分頁更新，請選擇「使用 LINE 重新登入」。",
    );
  }
}

const endpoint = "/api/auth";
const blockedKey = "line_bot_v1:session-blocked";
const channelName = "line_bot_v1:session";
const renewAfterMs = 6 * 60 * 60 * 1000;

let generation: AppSessionGeneration | undefined;
let renewAfter = 0;
let blockedReason: SessionBlockReason | undefined;
let transition = 0;
let pending:
  | {
      fingerprint: string | null;
      transition: number;
      promise: Promise<AppSessionGeneration | null>;
    }
  | undefined;
const blockListeners = new Set<(reason: SessionBlockReason) => void>();
const channel =
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel(channelName)
    : undefined;

function savedBlockReason(): SessionBlockReason | undefined {
  if (blockedReason) return blockedReason;
  if (typeof window === "undefined") return undefined;
  try {
    const stored = window.sessionStorage.getItem(blockedKey);
    return stored === "signed-out" || stored === "session-changed" ? stored : undefined;
  } catch {
    return undefined;
  }
}

function setBlocked(reason: SessionBlockReason, notify: boolean) {
  transition++;
  blockedReason = reason;
  generation = undefined;
  renewAfter = 0;
  try {
    window.sessionStorage.setItem(blockedKey, reason);
  } catch {
    // The current tab still honors the in-memory block when storage is unavailable.
  }
  for (const listener of blockListeners) listener(reason);
  if (notify) channel?.postMessage({ type: reason });
}

channel?.addEventListener("message", (event: MessageEvent<unknown>) => {
  const message = event.data as { type?: unknown } | null;
  if (message?.type === "signed-out" || message?.type === "session-changed") {
    setBlocked(message.type, false);
    // Drop private React state held by pages that do not own session controls.
    window.location.reload();
  }
});

export function lineSessionBlocked() {
  return savedBlockReason();
}

export function onLineSessionBlocked(listener: (reason: SessionBlockReason) => void) {
  blockListeners.add(listener);
  return () => {
    blockListeners.delete(listener);
  };
}

function appSessionHeaders(value: AppSessionGeneration): Record<string, string> {
  return { "X-App-Session-Generation": value };
}

function isGeneration(value: unknown): value is AppSessionGeneration {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

async function tokenFingerprint(lineAccessToken: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(lineAccessToken));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function responseError(response: Response) {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") return new Error(body.error);
  } catch {
    // Keep a bounded user-facing fallback for non-JSON failures.
  }
  return new Error("登入服務暫不可用，請稍後重試。");
}

async function readSessionGeneration() {
  const response = await fetch(endpoint, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  if (response.status === 401) return null;
  if (!response.ok) throw await responseError(response);
  const body = (await response.json()) as { generation?: unknown };
  if (!isGeneration(body.generation)) throw new Error("登入服務回應格式不正確。");
  return body.generation;
}

async function renewSession(current: AppSessionGeneration) {
  const response = await fetch(endpoint, {
    method: "PATCH",
    credentials: "same-origin",
    cache: "no-store",
    headers: appSessionHeaders(current),
  });
  if (response.status === 401) return false;
  if (!response.ok) throw await responseError(response);
  const body = (await response.json()) as { generation?: unknown };
  if (!isGeneration(body.generation) || body.generation !== current)
    throw new Error("登入狀態已變更，請重新登入。");
  renewAfter = Date.now() + renewAfterMs;
  return true;
}

async function exchangeLineProof(lineAccessToken: string, expectedTransition: number) {
  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken: lineAccessToken }),
  });
  if (!response.ok) throw await responseError(response);
  const body = (await response.json()) as {
    generation?: unknown;
    sessionChanged?: unknown;
  };
  if (!isGeneration(body.generation)) throw new Error("登入服務回應格式不正確。");
  if (transition !== expectedTransition) {
    const reason = savedBlockReason();
    if (reason === "signed-out") {
      await fetch(endpoint, {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store",
      }).catch(() => undefined);
    }
    throw new SessionBlockedError(reason ?? "session-changed");
  }
  const previousGeneration = generation;
  generation = body.generation;
  renewAfter = Date.now() + renewAfterMs;
  if (body.sessionChanged === true) {
    channel?.postMessage({ type: "session-changed" });
    if (previousGeneration && previousGeneration !== body.generation) window.location.reload();
  }
  return generation;
}

async function renewOrRecover(current: AppSessionGeneration, expectedTransition: number) {
  const renewed = await renewSession(current);
  if (transition !== expectedTransition)
    throw new SessionBlockedError(savedBlockReason() ?? "session-changed");
  if (renewed) return current;

  const latest = await readSessionGeneration();
  if (transition !== expectedTransition)
    throw new SessionBlockedError(savedBlockReason() ?? "session-changed");
  if (latest && latest !== current) {
    setBlocked("session-changed", true);
    throw new SessionBlockedError("session-changed");
  }
  if (latest) {
    generation = latest;
    renewAfter = Date.now() + renewAfterMs;
    return latest;
  }
  if (generation === current) {
    generation = undefined;
    renewAfter = 0;
  }
  return null;
}

export async function ensureLineServiceSession() {
  const blocked = savedBlockReason();
  if (blocked) throw new SessionBlockedError(blocked);
  const expectedTransition = transition;
  if (pending) {
    const active = pending;
    if (active.fingerprint === null && active.transition === expectedTransition)
      return active.promise;
    await active.promise.catch(() => null);
    if (transition !== expectedTransition)
      throw new SessionBlockedError(savedBlockReason() ?? "session-changed");
    return ensureLineServiceSession();
  }

  const promise = (async () => {
    if (generation) {
      if (Date.now() < renewAfter) return generation;
      return renewOrRecover(generation, expectedTransition);
    }
    const restored = await readSessionGeneration();
    if (transition !== expectedTransition)
      throw new SessionBlockedError(savedBlockReason() ?? "session-changed");
    if (!restored) return null;
    generation = restored;
    renewAfter = 0;
    return renewOrRecover(restored, expectedTransition);
  })();
  pending = { fingerprint: null, transition: expectedTransition, promise };
  try {
    return await promise;
  } finally {
    if (pending?.promise === promise) pending = undefined;
  }
}

export async function startLineServiceSession(lineAccessToken: string) {
  const blocked = savedBlockReason();
  if (blocked) throw new SessionBlockedError(blocked);
  if (!lineAccessToken) throw new Error("請從 LINE 重新開啟操作頁。");

  const expectedTransition = transition;
  const fingerprint = await tokenFingerprint(lineAccessToken);
  if (transition !== expectedTransition)
    throw new SessionBlockedError(savedBlockReason() ?? "session-changed");
  if (pending) {
    const active = pending;
    if (active.fingerprint === fingerprint && active.transition === expectedTransition)
      return active.promise;
    await active.promise.catch(() => null);
    if (transition !== expectedTransition)
      throw new SessionBlockedError(savedBlockReason() ?? "session-changed");
    return startLineServiceSession(lineAccessToken);
  }

  const promise = (async () => {
    if (!generation) {
      const restored = await readSessionGeneration();
      if (transition !== expectedTransition)
        throw new SessionBlockedError(savedBlockReason() ?? "session-changed");
      generation = restored ?? undefined;
      renewAfter = 0;
    }
    return exchangeLineProof(lineAccessToken, expectedTransition);
  })();
  pending = { fingerprint, transition: expectedTransition, promise };
  try {
    return await promise;
  } finally {
    if (pending?.promise === promise) pending = undefined;
  }
}

export function allowLineServiceSession() {
  transition++;
  blockedReason = undefined;
  try {
    window.sessionStorage.removeItem(blockedKey);
  } catch {
    // An explicit login attempt still clears the in-memory block.
  }
}

export async function endLineServiceSession() {
  const current = generation;
  setBlocked("signed-out", true);
  const response = await fetch(endpoint, {
    method: "DELETE",
    credentials: "same-origin",
    cache: "no-store",
    ...(current ? { headers: appSessionHeaders(current) } : {}),
  });
  if (!response.ok) throw await responseError(response);
}
