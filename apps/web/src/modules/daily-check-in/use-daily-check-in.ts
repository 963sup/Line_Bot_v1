"use client";

import type { UserUseCases } from "@line-work/account/application/user";
import type { DailyCheckIn } from "@line-work/daily-check-in/application";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import { authHeaders } from "../../shared/browser/supabase-session";

type AccountView = NonNullable<Awaited<ReturnType<UserUseCases["getUser"]>>>;
type DailyCheckInView = Awaited<ReturnType<DailyCheckIn["currentView"]>>;
export type CoinView = DailyCheckInView & { balance: number };
type CoinProjection = CoinView | { unavailable: true };
export type DailyCheckInClaim = NonNullable<Awaited<ReturnType<DailyCheckIn["readClaim"]>>>;
type View = AccountView & { coins: CoinProjection };
type MembershipWireResponse = { member: View | null };
type CheckInWireOutcome = Awaited<ReturnType<DailyCheckIn["checkIn"]>> & {
  coins: CoinProjection;
};
export type CheckInOutcome = Omit<CheckInWireOutcome, "coins" | "claim"> & {
  claim: DailyCheckInClaim | null;
  coins?: CoinView;
  day?: string;
  message?: string;
  recovered?: boolean;
  state?: "claimed" | "pending" | "rejected";
};

export function isCoinView(value: CoinProjection): value is CoinView {
  return !("unavailable" in value);
}

class MembershipRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MembershipRequestError";
  }
}

export function useDailyCheckIn(liffId: string) {
  const request = useRef<AbortController | null>(null);
  const identity = useRef<string | null>(null);
  const unresolvedDayRef = useRef<string | null>(null);
  const mounted = useRef(true);
  const [user, setUser] = useState<View | null>(null);
  const [token, setToken] = useState("");
  const [inClient, setInClient] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [unresolvedDay, setUnresolvedDay] = useState<string | null>(null);

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

  function clearUnknownResult() {
    unresolvedDayRef.current = null;
    setUnresolvedDay(null);
  }

  async function load(access: string, signal: AbortSignal) {
    const headers = await authHeaders(access);
    signal.throwIfAborted();
    const response = await fetch("/api/membership", { headers, cache: "no-store", signal });
    const data = (await response.json()) as MembershipWireResponse & { error?: string };
    signal.throwIfAborted();
    if (!response.ok) throw new Error(data.error ?? "每日簽到資料讀取失敗。");
    const nextIdentity = data.member?.id ?? null;
    if (identity.current !== nextIdentity) clearUnknownResult();
    identity.current = nextIdentity;
    setUser(data.member);
    if (!data.member) clearUnknownResult();
  }

  async function initialize() {
    if (!mounted.current) return;
    const signal = begin();
    setUser(null);
    setToken("");
    setNotice("");
    clearUnknownResult();
    try {
      if (!liffId) throw new Error("每日簽到入口尚未設定。");
      const access = await liffClient.session(liffId);
      signal.throwIfAborted();
      if (!access) return;
      setToken(access);
      setInClient(liffClient.inClient());
      await load(access, signal);
    } catch (cause) {
      if (!signal.aborted)
        setError(cause instanceof Error ? cause.message : "每日簽到頁載入失敗。");
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
      if (!signal.aborted)
        setError(cause instanceof Error ? cause.message : "每日簽到資料讀取失敗。");
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  async function recover(
    access: string,
    day: string,
    signal: AbortSignal,
  ): Promise<DailyCheckInClaim | null> {
    const headers = await authHeaders(access);
    signal.throwIfAborted();
    const response = await fetch(
      `/api/membership?${new URLSearchParams({ checkInDay: day })}`,
      { headers, cache: "no-store", signal },
    );
    const data = (await response.json()) as { claim?: DailyCheckInClaim | null; error?: string };
    signal.throwIfAborted();
    if (!response.ok)
      throw new MembershipRequestError(data.error ?? "簽到結果讀取失敗。", response.status);
    await load(access, signal);
    return data.claim ?? null;
  }

  async function readPending(day: string, signal: AbortSignal): Promise<CheckInOutcome> {
    try {
      const claim = await recover(token, day, signal);
      if (claim) {
        clearUnknownResult();
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
    } catch (cause) {
      if (cause instanceof MembershipRequestError && [400, 403, 409].includes(cause.status)) {
        clearUnknownResult();
        setError(cause.message);
        return {
          claim: null,
          credited: 0,
          day,
          message: cause.message,
          replayed: true,
          recovered: true,
          state: "rejected",
        };
      }
      throw cause;
    }
  }

  async function checkIn(retryOriginal = false): Promise<CheckInOutcome | null> {
    const signal = begin();
    setNotice("");
    const pendingDay = unresolvedDayRef.current;
    if (pendingDay && !retryOriginal) {
      try {
        return await readPending(pendingDay, signal);
      } catch (cause) {
        if (!signal.aborted)
          setError(cause instanceof Error ? cause.message : "簽到結果讀取失敗。");
        return null;
      } finally {
        if (!signal.aborted) setBusy(false);
      }
    }

    const currentCoins = user && isCoinView(user.coins) ? user.coins : null;
    const expectedDay = pendingDay ?? currentCoins?.day ?? null;
    if (!expectedDay) {
      setError("目前沒有可用的每日簽到日期，請重新整理。");
      setBusy(false);
      return null;
    }
    unresolvedDayRef.current = expectedDay;
    setUnresolvedDay(expectedDay);

    try {
      const headers = await authHeaders(token);
      signal.throwIfAborted();
      const response = await fetch("/api/membership", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkIn", expectedDay }),
        signal,
      });
      const data = (await response.json()) as MembershipWireResponse & {
        checkIn?: CheckInWireOutcome;
        error?: string;
      };
      signal.throwIfAborted();
      if (!response.ok)
        throw new MembershipRequestError(data.error ?? "簽到操作失敗。", response.status);
      if (!data.checkIn) throw new Error("簽到回應不完整。");
      setUser(data.member);
      clearUnknownResult();
      setNotice(
        data.checkIn.credited
          ? `簽到成功，已領取 ${data.checkIn.credited} Coin。`
          : "今天已領取，明天再來！",
      );
      return {
        ...data.checkIn,
        coins: isCoinView(data.checkIn.coins) ? data.checkIn.coins : undefined,
        state: "claimed",
      };
    } catch (cause) {
      if (signal.aborted) return null;
      setError(cause instanceof Error ? cause.message : "簽到操作失敗。");
      if (cause instanceof MembershipRequestError && [400, 403, 409].includes(cause.status)) {
        clearUnknownResult();
        return {
          claim: null,
          credited: 0,
          day: expectedDay,
          message: cause.message,
          replayed: false,
          state: "rejected",
        };
      }
      try {
        return await readPending(expectedDay, signal);
      } catch {
        // Preserve the original failure and unresolved day for explicit readback.
      }
    } finally {
      if (!signal.aborted) setBusy(false);
    }
    return null;
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

  return {
    user,
    busy,
    error,
    notice,
    unresolvedDay,
    initialize,
    refresh,
    checkIn,
    setBusy,
  };
}
