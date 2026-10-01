"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { resolveVerifiedProfileEntry } from "../../../modules/account/profile-entry-client";
import MiniAppRuntime from "../../../shared/browser/mini-app-runtime";

type State = "loading" | "waiting" | "integrity-unavailable" | "suspended" | "unavailable";

export default function ProfileEntry({ liffId }: { liffId: string }) {
  const router = useRouter();
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const [state, setState] = useState<State>("loading");

  const wait = useCallback(() => {
    generation.current++;
    request.current?.abort();
    setState("waiting");
  }, []);

  const resolve = useCallback(async () => {
    const ticket = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState("loading");
    try {
      const result = await resolveVerifiedProfileEntry(liffId, controller.signal);
      if (ticket !== generation.current) return;
      if (result.kind === "waiting") {
        setState("waiting");
        return;
      }
      if (result.kind === "redirect") {
        router.replace(result.href);
        return;
      }
      setState(result.kind);
    } catch {
      if (ticket === generation.current) setState("unavailable");
    }
  }, [liffId, router]);

  useEffect(
    () => () => {
      generation.current++;
      request.current?.abort();
    },
    [],
  );

  return (
    <main className="app-content">
      <MiniAppRuntime liffId={liffId} onReady={resolve} onWait={wait} />
      <h1>個人檔案</h1>
      {state === "loading" || state === "waiting" ? (
        <p role="status">正在確認你的個人檔案…</p>
      ) : state === "integrity-unavailable" ? (
        <p role="alert">帳號識別資料不完整，個人檔案目前無法使用。請聯絡管理者。</p>
      ) : state === "suspended" ? (
        <p role="alert">會員已停權，請聯絡管理者。</p>
      ) : (
        <>
          <p role="alert">個人檔案服務暫不可用，請稍後重試。</p>
          <button type="button" onClick={() => void resolve()}>
            重試
          </button>
        </>
      )}
    </main>
  );
}
