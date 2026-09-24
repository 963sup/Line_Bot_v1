"use client";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { accessState } from "../../shared/presentation/access-state";

/** Presentation gate only: API handlers independently enforce all permissions. */
export default function RouteAccess({
  children,
  liffId,
  mode,
}: {
  children: ReactNode;
  liffId: string;
  mode: "app" | "onboarding";
}) {
  const [state, setState] = useState("loading");
  async function check() {
    setState("loading");
    try {
      const token = await liffClient.session(liffId);
      if (!token) return;
      const response = await fetch("/api/membership", {
        headers: { "x-line-token": token },
        cache: "no-store",
      });
      if (!response.ok) {
        setState(response.status === 401 ? "login" : "error");
        return;
      }
      const data = await response.json();
      setState(accessState(true, data.member === null ? null : data.member?.status, mode));
    } catch {
      setState("error");
    }
  }
  if (state === "allowed") return children;
  return (
    <main className="app-content">
      <MiniAppRuntime liffId={liffId} onReady={check} onWait={() => setState("waiting")} />
      <h1>{mode === "app" ? "進入工作助手" : "完成會員設定"}</h1>
      {state === "loading" || state === "waiting" || state === "pending" ? (
        <p role="status">正在確認 LINE 登入與會員資格…</p>
      ) : state === "invalid" ? (
        <p role="alert">入口連結不完整，請重新選擇服務。</p>
      ) : state === "suspended" ? (
        <p role="alert">會員已停權，請聯絡管理者。</p>
      ) : state === "register" ? (
        <Link className="diary-link" href="/membership/register">
          註冊會員
        </Link>
      ) : state === "restore" ? (
        <Link className="diary-link" href="/membership/restore">
          恢復會員功能
        </Link>
      ) : (
        <>
          <p role="alert">
            {state === "login" ? "登入已失效，請重新登入。" : "會員服務暫不可用，請稍後重試。"}
          </p>
          <button onClick={() => void check()}>重試</button>
        </>
      )}
      <p>
        <Link href="/">返回公開入口</Link>
      </p>
    </main>
  );
}
