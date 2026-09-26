"use client";

import type { UserUseCases } from "@line-work/account/application/user";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import { authHeaders } from "../../shared/browser/supabase-session";

type AccountView = NonNullable<Awaited<ReturnType<UserUseCases["getUser"]>>>;
type MembershipWireResponse = { member: AccountView | null };

/** Current-viewer Account lifecycle for Settings/onboarding; DailyCheckIn has its own Web module. */
export function useUser(liffId: string) {
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [pending, setPending] = useState<{
    id: string;
    email: string | null;
    expiresAt: number;
  } | null>(null);
  const [user, setUser] = useState<AccountView | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(true);
  const [lineName, setLineName] = useState("");
  const [inClient, setInClient] = useState(false);
  const [error, setError] = useState("");
  const [pauseConfirmation, setPauseConfirmation] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);

  function begin() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    return controller.signal;
  }

  async function load(access: string, signal: AbortSignal) {
    const headers = await authHeaders(access);
    signal.throwIfAborted();
    const result = await fetch("/api/membership?view=account", {
      headers,
      cache: "no-store",
      signal,
    });
    const data = (await result.json()) as MembershipWireResponse & { error?: string };
    signal.throwIfAborted();
    if (!result.ok) throw new Error(data.error ?? "會員資料讀取失敗。");
    const account = data.member;
    setUser(account);
    if (account?.status === "active") {
      const response = await fetch("/api/membership/google-link", {
        headers,
        cache: "no-store",
        signal,
      });
      const link = await response.json();
      signal.throwIfAborted();
      if (!response.ok) throw new Error(link.error ?? "Google 關聯資料讀取失敗。");
      setPending(link.pending);
    } else {
      setPending(null);
    }
  }

  async function initialize() {
    if (!mounted.current) return;
    const signal = begin();
    setUser(null);
    setToken("");
    setLineName("");
    setPauseConfirmation(false);
    setPending(null);
    try {
      if (!liffId) throw new Error("會員入口尚未設定。");
      const access = await liffClient.session(liffId);
      signal.throwIfAborted();
      if (!access) return;
      setInClient(liffClient.inClient());
      setToken(access);
      // Provider profile is presentation only; Account qualification never waits for it.
      void liffClient.profile().then(
        (profile) => {
          if (!signal.aborted) setLineName(profile.displayName);
        },
        () => {
          // Keep the fallback name when optional provider presentation is unavailable.
        },
      );
      await load(access, signal);
    } catch (cause) {
      if (signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "會員頁載入失敗。");
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  async function refresh() {
    if (!token) return initialize();
    const signal = begin();
    try {
      await load(token, signal);
    } catch (cause) {
      if (signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "請重新開啟會員頁。");
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  const onResume = useEffectEvent(() => {
    if (document.visibilityState === "visible") void refresh();
  });

  useEffect(() => {
    if (!token || !inClient || busy) return;
    const resume = () => onResume();
    document.addEventListener("visibilitychange", resume);
    return () => document.removeEventListener("visibilitychange", resume);
  }, [token, inClient, busy]);

  async function googleLink(action: "start" | "confirm" | "cancel" | "unlink") {
    const signal = begin();
    try {
      const access = await liffClient.session(liffId);
      signal.throwIfAborted();
      if (!access) return;
      const response = await fetch("/api/membership/google-link", {
        method: "POST",
        signal,
        headers: { "X-Line-Token": access, "Content-Type": "application/json" },
        body: JSON.stringify({ action, id: pending?.id }),
      });
      const data = await response.json();
      signal.throwIfAborted();
      if (!response.ok) throw new Error(data.error ?? "綁定操作失敗，請重試。");
      if (action === "start") {
        const url = `${location.origin}/google-link#request=${encodeURIComponent(data.token)}`;
        if (liffClient.inClient()) liffClient.openExternal(url);
        else location.assign(url);
      }
      if (action === "confirm") setNotice("Google 綁定完成。");
      if (action === "unlink") setNotice("Google 綁定已解除；LINE 身分與既有資料保持不變。");
      await load(access, signal);
    } catch (cause) {
      if (!signal.aborted)
        setError(cause instanceof Error ? cause.message : "綁定操作失敗，請重試。");
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  async function action(action: "register" | "restore" | "deactivate", input?: { login?: string }) {
    const signal = begin();
    setNotice("");
    try {
      const access = token || (await liffClient.session(liffId));
      signal.throwIfAborted();
      if (!access) throw new Error("請完成 LINE 登入。");
      const headers = await authHeaders(access);
      signal.throwIfAborted();
      const endpoint =
        action === "register" || action === "restore"
          ? `/api/membership/${action}`
          : "/api/membership";
      const result = await fetch(endpoint, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "register" ? { login: input?.login } : action === "restore" ? {} : { action },
        ),
        signal,
      });
      const data = (await result.json()) as MembershipWireResponse & { error?: string };
      signal.throwIfAborted();
      if (!result.ok) throw new Error(data.error ?? "操作失敗，請重試。");
      if (action === "register" || action === "restore")
        setNotice("會員已開通，可以使用工作功能。");
      await load(access, signal);
      setPauseConfirmation(false);
    } catch (cause) {
      if (signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "操作失敗，請重試。");
      try {
        const access = token || (await liffClient.session(liffId));
        if (access && !signal.aborted) await load(access, signal);
      } catch {
        // Keep the original operation error; explicit refresh remains available.
      }
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  return {
    user,
    token,
    busy,
    lineName,
    inClient,
    error,
    pauseConfirmation,
    notice,
    initialize,
    refresh,
    action,
    pending,
    googleLink,
    setBusy,
    setError,
    setPauseConfirmation,
  };
}
