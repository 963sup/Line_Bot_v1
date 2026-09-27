"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { liffClient } from "../../../shared/browser/liff-client";
import MiniAppRuntime from "../../../shared/browser/mini-app-runtime";
import { type ProfileAccount, resolveProfileDestination } from "./profile-resolver";

type AccountProjection = { member?: ProfileAccount | null; error?: string };
type State = "loading" | "waiting" | "integrity-unavailable" | "suspended" | "unavailable";

export default function ProfileEntry({ liffId }: { liffId: string }) {
  const router = useRouter();
  const generation = useRef(0);
  const [state, setState] = useState<State>("loading");

  const wait = useCallback(() => {
    generation.current++;
    setState("waiting");
  }, []);

  const resolve = useCallback(async () => {
    const ticket = ++generation.current;
    setState("loading");
    try {
      const token = await liffClient.session(liffId);
      if (!token || ticket !== generation.current) return;
      const response = await fetch("/api/membership?view=account", {
        headers: { "x-line-token": token },
        cache: "no-store",
      });
      const value = (await response.json()) as AccountProjection;
      if (ticket !== generation.current) return;
      if (!response.ok) {
        setState("unavailable");
        return;
      }
      const result = resolveProfileDestination(value.member ?? null);
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
