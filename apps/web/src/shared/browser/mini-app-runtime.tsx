"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { liffClient } from "./liff-client";

/**
 * LIFF boot starts when liff-client is evaluated. This component only observes readiness and
 * hands control to the feature; React hydration is not an initialization prerequisite anymore.
 */
export default function MiniAppRuntime({
  liffId,
  onReady,
  onWait,
  silent = false,
}: {
  liffId: string;
  onReady: () => Promise<void>;
  onWait: () => void;
  silent?: boolean;
}) {
  const [error, setError] = useState("");
  const started = useRef(false);
  const ready = useRef(onReady);
  const wait = useRef(onWait);
  ready.current = onReady;
  wait.current = onWait;

  const initialize = useCallback(async () => {
    setError("");
    try {
      if (!(await liffClient.initialize(liffId))) {
        wait.current();
        return;
      }
      await ready.current();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登入載入失敗。");
      wait.current();
    }
  }, [liffId]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void initialize();
  }, [initialize]);

  return error && !silent ? (
    <div role="alert">
      <p>{error}</p>
      <button onClick={() => void initialize()}>重試 LINE 登入</button>
    </div>
  ) : null;
}
