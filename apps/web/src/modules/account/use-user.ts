"use client";
import type { UserUseCases } from "@line-work/account/application/user";
import type { DailyCheckIn } from "@line-work/daily-check-in/application";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import { authHeaders } from "../../shared/browser/supabase-session";

type AccountView = NonNullable<Awaited<ReturnType<UserUseCases["getUser"]>>>;
export type CoinView = Awaited<ReturnType<DailyCheckIn["coinView"]>>;
export type DailyCheckInClaim = NonNullable<Awaited<ReturnType<DailyCheckIn["readClaim"]>>>;
type View = AccountView & { coins: CoinView };
type MembershipWireResponse = { member: View | null };
type CheckInWireOutcome = Awaited<ReturnType<DailyCheckIn["checkIn"]>>["checkIn"];
export type CheckInOutcome = Omit<CheckInWireOutcome, "coins" | "claim"> & {
  claim: DailyCheckInClaim | null;
  coins?: CoinView;
  day?: string;
  message?: string;
  recovered?: boolean;
  state?: "claimed" | "pending" | "rejected";
};
class MembershipRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MembershipRequestError";
  }
}
/** Shared lifecycle for the existing membership API; each screen owns its presentation. */
export function useUser(liffId: string) {
  const request = useRef<AbortController | null>(null);
  const identity = useRef<string | null>(null);
  const unresolvedCheckInDay = useRef<string | null>(null);
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
  const [unresolvedCheckIn, setUnresolvedCheckIn] = useState<string | null>(null);
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
    const nextIdentity = account?.id ?? null;
    if (identity.current !== nextIdentity) {
      unresolvedCheckInDay.current = null;
      setUnresolvedCheckIn(null);
    }
    identity.current = nextIdentity;
    setUser(account);
    if (!account) {
      unresolvedCheckInDay.current = null;
      setUnresolvedCheckIn(null);
    }
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
      identity.current = null;
      unresolvedCheckInDay.current = null;
      setUnresolvedCheckIn(null);
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

  async function recoverCheckIn(
    access: string,
    day: string,
    signal: AbortSignal,
  ): Promise<DailyCheckInClaim | null> {
    const headers = await authHeaders(access);
    signal.throwIfAborted();
    const result = await fetch(`/api/membership?${new URLSearchParams({ checkInDay: day })}`, {
      headers,
      cache: "no-store",
      signal,
    });
    const data = (await result.json()) as { claim?: DailyCheckInClaim | null; error?: string };
    signal.throwIfAborted();
    if (!result.ok)
      throw new MembershipRequestError(data.error ?? "簽到結果讀取失敗。", result.status);
    await load(access, signal);
    return data.claim ?? null;
  }

  async function readPendingCheckIn(day: string, signal: AbortSignal): Promise<CheckInOutcome> {
    try {
      const claim = await recoverCheckIn(token, day, signal);
      if (claim) {
        unresolvedCheckInDay.current = null;
        setUnresolvedCheckIn(null);
        setError("");
        setNotice("已讀回今日簽到結果，未重新抽獎。");
        return {
          claim,
          credited: 0,
          day,
          replayed: true,
          recovered: true,
          state: "claimed",
        };
      }
      setError("");
      setNotice(`${day} 的簽到還沒有確認結果；未重新送出簽到。`);
      return {
        claim: null,
        credited: 0,
        day,
        message: `${day} 尚無已完成的簽到。可再讀取，或明確重新送出原日簽到；不會重複發獎。`,
        replayed: true,
        recovered: true,
        state: "pending",
      };
    } catch (e) {
      if (e instanceof MembershipRequestError && [400, 403, 409].includes(e.status)) {
        unresolvedCheckInDay.current = null;
        setUnresolvedCheckIn(null);
        setError(e.message);
        return {
          claim: null,
          credited: 0,
          day,
          message: e.message,
          replayed: true,
          recovered: true,
          state: "rejected",
        };
      }
      throw e;
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
    input?: { login?: string; retryOriginal?: boolean },
  ): Promise<CheckInOutcome | null> {
    const signal = begin();
    setNotice("");
    const pendingCheckInDay = action === "checkIn" ? unresolvedCheckInDay.current : null;
    if (pendingCheckInDay && !input?.retryOriginal) {
      try {
        return await readPendingCheckIn(pendingCheckInDay, signal);
      } catch (e) {
        if (!signal.aborted) setError(e instanceof Error ? e.message : "簽到結果讀取失敗。");
        return null;
      } finally {
        if (!signal.aborted) setBusy(false);
      }
    }
    const checkInDay = action === "checkIn" ? (pendingCheckInDay ?? user?.coins.day) : null;
    if (action === "checkIn") {
      unresolvedCheckInDay.current = checkInDay ?? null;
      setUnresolvedCheckIn(checkInDay ?? null);
    }
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
          action === "register"
            ? { login: input?.login }
            : action === "restore"
              ? {}
              : action === "checkIn"
                ? { action, expectedDay: checkInDay }
                : { action },
        ),
        signal,
      });
      const data = await result.json();
      signal.throwIfAborted();
      if (!result.ok)
        throw new MembershipRequestError(data.error ?? "操作失敗，請重試。", result.status);
      if (data.checkIn) {
        const checkIn = data.checkIn as CheckInOutcome;
        setUser((data as MembershipWireResponse).member);
        unresolvedCheckInDay.current = null;
        setUnresolvedCheckIn(null);
        setNotice(
          checkIn.credited
            ? `簽到成功，已領取 ${checkIn.credited} Coin。`
            : "今天已領取，明天再來！",
        );
        return { ...checkIn, state: "claimed" };
      } else {
        if (action === "register" || action === "restore")
          setNotice("會員已開通，可以直接使用簽到與記帳。");
        await load(token, signal);
        setPauseConfirmation(false);
      }
    } catch (e) {
      if (signal.aborted) return null;
      setError(e instanceof Error ? e.message : "操作失敗，請重試。");
      if (
        action === "checkIn" &&
        e instanceof MembershipRequestError &&
        [400, 403, 409].includes(e.status)
      ) {
        unresolvedCheckInDay.current = null;
        setUnresolvedCheckIn(null);
        return {
          claim: null,
          credited: 0,
          day: checkInDay ?? undefined,
          message: e.message,
          replayed: false,
          state: "rejected",
        };
      }
      if (action === "checkIn" && checkInDay) {
        try {
          return await readPendingCheckIn(checkInDay, signal);
        } catch {
          /* Keep the original error; refresh remains available. */
        }
      } else {
        try {
          await load(token, signal);
        } catch {
          /* Keep the original error; refresh remains available. */
        }
      }
    } finally {
      if (!signal.aborted) setBusy(false);
    }
    return null;
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
    unresolvedCheckIn,
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
