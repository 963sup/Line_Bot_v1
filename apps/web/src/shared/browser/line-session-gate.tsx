"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { liffClient } from "./liff-client";
import { SessionBlockedError } from "./line-service-session";

type GateState = "loading" | "ready" | "signed-out" | "unavailable";

export default function LineSessionGate({
  children,
  liffId,
}: {
  children: ReactNode;
  liffId: string;
}) {
  const [state, setState] = useState<GateState>("loading");

  const establish = useCallback(
    async (explicit: boolean) => {
      setState("loading");
      try {
        const session = explicit
          ? await liffClient.startSession(liffId)
          : await liffClient.ensureSession(liffId);
        setState(session ? "ready" : "unavailable");
      } catch (error: unknown) {
        setState(error instanceof SessionBlockedError ? "signed-out" : "unavailable");
      }
    },
    [liffId],
  );

  useEffect(() => {
    const unsubscribe = liffClient.onSessionBlocked((reason) => {
      setState(reason === "signed-out" ? "signed-out" : "unavailable");
    });
    void establish(false);
    return unsubscribe;
  }, [establish]);

  // Existing settings/session controls own the signed-out recovery action.
  // Let them render after the gate has established that the session is blocked;
  // server routes continue to enforce the session independently.
  if (state === "ready" || state === "signed-out") return children;

  const waiting = state === "loading";
  return (
    <main className="app-content" aria-busy={waiting} aria-labelledby="line-session-gate-title">
      <h1 id="line-session-gate-title">正在進入服務</h1>
      <p role="status">
        {waiting ? "正在確認服務登入狀態…" : "目前無法確認服務登入狀態，請從 LINE MINI App 開啟。"}
      </p>
      {!waiting && (
        <button type="button" onClick={() => void establish(true)}>
          使用 LINE 重新登入
        </button>
      )}
    </main>
  );
}
