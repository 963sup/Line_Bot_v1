"use client";

import type { UserUseCases } from "@line-work/account/application/user";
import { useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";

type AccountView = NonNullable<Awaited<ReturnType<UserUseCases["getUser"]>>>;

export default function LoginPanel({ liffId }: { liffId: string }) {
  const [login, setLogin] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0);

  function clear() {
    generation.current++;
    setLogin("");
    setLoaded(false);
    setBusy(false);
    setError("");
    setNotice("");
  }

  async function load() {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const token = await liffClient.session(liffId);
      if (!token) throw new Error("請完成 LINE 登入後重試。");
      const response = await fetch("/api/membership", {
        headers: { "x-line-token": token },
        cache: "no-store",
      });
      const value = (await response.json()) as { member?: AccountView | null; error?: string };
      if (!response.ok) throw new Error(value.error ?? "登入名稱讀取失敗。");
      if (ticket !== generation.current) return;
      setLogin(value.member?.login ?? "");
      setLoaded(Boolean(value.member));
    } catch (cause) {
      if (ticket === generation.current) {
        setLoaded(false);
        setError(cause instanceof Error ? cause.message : "登入名稱讀取失敗。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  async function save() {
    if (busy) return;
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const token = await liffClient.session(liffId);
      if (!token) throw new Error("請完成 LINE 登入後重試。");
      const response = await fetch("/api/membership", {
        method: "POST",
        headers: {
          "x-line-token": token,
          "content-type": "application/json",
        },
        body: JSON.stringify({ action: "updateLogin", login }),
      });
      const value = (await response.json()) as { member?: AccountView; error?: string };
      if (!response.ok || !value.member) throw new Error(value.error ?? "登入名稱保存失敗。");
      if (ticket !== generation.current) return;
      setLogin(value.member.login ?? "");
      setLoaded(true);
      setNotice("登入名稱已保存。");
    } catch (cause) {
      if (ticket === generation.current) {
        setError(cause instanceof Error ? cause.message : "登入名稱保存失敗。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  useEffect(() => {
    const visibility = () => (document.visibilityState === "hidden" ? clear() : void load());
    document.addEventListener("visibilitychange", visibility);
    return () => {
      generation.current++;
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  return (
    <section>
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      <h2>登入名稱</h2>
      <p>Login 是 User 的公開 locator，不屬於 Profile metadata。</p>
      {busy && <p role="status">正在確認登入名稱…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loaded && (
        <form
          className="profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
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
          <button type="submit" disabled={busy || !login.trim()}>
            保存登入名稱
          </button>
        </form>
      )}
    </section>
  );
}
