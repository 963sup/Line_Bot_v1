"use client";
import Link from "next/link";
import { useState } from "react";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { useUser } from "./use-user";

export default function MembershipSetup({
  liffId,
  intent,
}: {
  liffId: string;
  intent: "register" | "restore";
}) {
  const { user, token, busy, lineName, error, notice, initialize, refresh, action, setBusy } =
    useUser(liffId);
  const [login, setLogin] = useState("");
  return (
    <>
      <MiniAppRuntime liffId={liffId} onReady={initialize} onWait={() => setBusy(false)} />
      <h1>{intent === "restore" ? "恢復會員功能" : "註冊會員"}</h1>
      {busy && <p role="status">正在確認 LINE 身分…</p>}
      {error && (
        <p role="alert" className="expense-error">
          {error}
        </p>
      )}
      {!busy && !error && token && (
        <section>
          <p>LINE：{lineName}</p>
          {user?.status === "active" ? (
            <>
              <h2>{notice ? "操作完成" : "你已是會員"}</h2>
              <p role="status">可以返回 LINE 使用工作助手。</p>
            </>
          ) : user?.status === "suspended" ? (
            <p>會員已停權，請聯絡管理者。</p>
          ) : intent === "register" && user ? (
            <>
              <p>會員已註冊，功能目前暫停。</p>
              <Link href="/membership/restore">恢復會員功能</Link>
            </>
          ) : intent === "restore" && !user ? (
            <>
              <p>目前尚未註冊。</p>
              <Link href="/membership/register">註冊會員</Link>
            </>
          ) : (
            <>
              <p>
                {intent === "register"
                  ? "確認後以目前 LINE 身分與唯一 login 建立 User。Google 關聯為選填。"
                  : "確認後恢復會員功能，既有資料保留。"}
              </p>
              {intent === "register" && (
                <label>
                  Login
                  <input
                    autoCapitalize="none"
                    autoCorrect="off"
                    maxLength={39}
                    pattern="[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?"
                    value={login}
                    onChange={(event) => setLogin(event.target.value)}
                    placeholder="alice"
                    required
                  />
                </label>
              )}
              <button
                disabled={busy || (intent === "register" && !login.trim())}
                onClick={() => action(intent, intent === "register" ? { login } : undefined)}
              >
                {intent === "register" ? "確認註冊" : "確認恢復"}
              </button>
            </>
          )}
        </section>
      )}
      {error && (
        <button disabled={busy} onClick={() => void refresh()}>
          重試
        </button>
      )}
    </>
  );
}
