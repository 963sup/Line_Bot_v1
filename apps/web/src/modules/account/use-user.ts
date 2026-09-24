"use client";
import type { UserUseCases } from "@line-work/account/application/user";
import type { DailyCheckIn } from "@line-work/daily-check-in/application";
import { useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import { authHeaders } from "../../shared/browser/supabase-session";

type CoinView = Awaited<ReturnType<DailyCheckIn["coinView"]>>;
type AccountView = NonNullable<Awaited<ReturnType<UserUseCases["getUser"]>>>;
type View = AccountView & { coins: CoinView };
type MembershipWireResponse = { member: View | null };
/** Shared lifecycle for the existing membership API; each screen owns its presentation. */
export function useUser(liffId: string) {
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [pending, setPending] = useState<{
    id: string;
    email: string | null;
    expiresAt: number;
  } | null>(null);
  const [user, setUser] = useState<View | null>(null);
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
    const result = await fetch("/api/membership", { headers, cache: "no-store", signal });
    // The published /api/membership protocol retains its historical member field.
    const data = (await result.json()) as MembershipWireResponse & { error?: string };
    signal.throwIfAborted();
    if (!result.ok) throw new Error(data.error);
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
      if (!response.ok) throw new Error(link.error);
      setPending(link.pending);
    } else setPending(null);
  }

  /**
   * 初始化 LIFF SDK 並換取官方 Access Token
   */
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
      // Profile is presentation only; membership must not wait for its scope or response.
      void liffClient.profile().then(
        (profile) => {
          if (!signal.aborted) setLineName(profile.displayName);
        },
        () => {
          // Keep the fallback name when the optional profile is unavailable.
        },
      );
      await load(access, signal);
    } catch (e) {
      if (signal.aborted) return;
      setError(e instanceof Error ? e.message : "會員頁載入失敗。");
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  /**
   * 重新整理當前狀態（用於 Google 外部登入完成後返回核對）
   */
  async function refresh() {
    if (!token) return initialize();
    const signal = begin();
    try {
      await load(token, signal);
    } catch (e) {
      if (signal.aborted) return;
      setError(e instanceof Error ? e.message : "請重新開啟會員頁。");
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    if (!token || !inClient || busy) return;
    const resume = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", resume);
    return () => document.removeEventListener("visibilitychange", resume);
  }, [token, inClient, busy]);

  async function googleLink(action: "start" | "confirm" | "cancel" | "unlink") {
    const signal = begin();
    try {
      // 每次操作重新取得 LINE 證明；伺服器決定 owner，不信任 client userId。
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
      if (!response.ok) throw new Error(data.error);
      if (action === "start") {
        const url = `${location.origin}/google-link#request=${encodeURIComponent(data.token)}`;
        if (liffClient.inClient()) liffClient.openExternal(url);
        else location.assign(url);
      }
      if (action === "confirm") setNotice("Google 綁定完成。");
      if (action === "unlink") setNotice("Google 綁定已解除；LINE 身分與既有資料保持不變。");
      await load(token, signal);
    } catch (e) {
      if (!signal.aborted) setError(e instanceof Error ? e.message : "綁定操作失敗，請重試。");
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  async function action(
    action: "register" | "restore" | "checkIn" | "deactivate",
    input?: { login?: string },
  ) {
    const signal = begin();
    setNotice("");
    try {
      const headers = await authHeaders(token);
      signal.throwIfAborted();
      const endpoint =
        action === "register" || action === "restore"
          ? `/api/membership/${action}`
          : "/api/membership";
      const result = await fetch(endpoint, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          action === "register" ? { login: input?.login } : action === "restore" ? {} : { action },
        ),
        signal,
      });
      const data = await result.json();
      signal.throwIfAborted();
      if (!result.ok) throw new Error(data.error);
      if (data.checkIn) {
        setUser((data as MembershipWireResponse).member);
        setNotice(
          data.checkIn.credited
            ? `簽到成功，已領取 ${data.checkIn.credited} Coin。`
            : "今天已領取，明天再來！",
        );
      } else {
        if (action === "register" || action === "restore")
          setNotice("會員已開通，可以直接使用簽到與記帳。");
        await load(token, signal);
        setPauseConfirmation(false);
      }
    } catch (e) {
      if (signal.aborted) return;
      setError(e instanceof Error ? e.message : "操作失敗，請重試。");
      try {
        await load(token, signal);
      } catch {
        /* Keep the original error; refresh remains available. */
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
