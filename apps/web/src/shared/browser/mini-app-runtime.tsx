"use client";
import Script from "next/script";
import { useState } from "react";
import { liffClient } from "./liff-client";

async function installLocalMock() {
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_USE_LIFF_MOCK !== "true")
    return;
  const { LiffMockPlugin } = await import("@line/liff-mock");
  const liff = window.liff as Window["liff"] & { use?: (plugin: unknown) => void };
  if (typeof liff.use !== "function")
    throw new Error("LINE mock 元件載入失敗，請改用真實 LIFF SDK。");
  liff.use(new LiffMockPlugin());
}

/** LIFF runtime only: initialize the SDK, then let callers decide the next step. */
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
  async function initialize() {
    setError("");
    try {
      await installLocalMock();
      if (!(await liffClient.initialize(liffId))) {
        onWait();
        return;
      }
      await onReady();
    } catch (e) {
      setError(e instanceof Error ? e.message : "登入載入失敗。");
      onWait();
    }
  }
  return (
    <>
      <Script
        src="https://static.line-scdn.net/liff/edge/2/sdk.js"
        strategy="afterInteractive"
        onReady={() => {
          void initialize();
        }}
        onError={() => {
          setError("LINE 元件載入失敗，請重新開啟。");
          onWait();
        }}
      />
      {error && !silent && (
        <div role="alert">
          <p>{error}</p>
          <button onClick={() => void initialize()}>重試 LINE 登入</button>
        </div>
      )}
    </>
  );
}
