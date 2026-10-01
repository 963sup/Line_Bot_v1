"use client";

import type {
  RepositorySubscriptionCommand,
  RepositorySubscriptionSnapshot,
  RepositorySubscriptionState,
} from "@line_bot_v1/repository/application/ports/subscription";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";

type PendingSubscription = Readonly<{
  owner: string;
  command: RepositorySubscriptionCommand;
}>;

function storageKey(ownerLogin: string, repositoryName: string) {
  return (
    "repository-subscription:" +
    ownerLogin.toLowerCase() +
    "/" +
    repositoryName.toLowerCase()
  );
}

function readPending(
  key: string,
  owner: string,
  repositoryId: string,
): PendingSubscription | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingSubscription;
    if (
      !value ||
      value.owner !== owner ||
      value.command?.action !== "set" ||
      value.command.repositoryId !== repositoryId ||
      typeof value.command.requestId !== "string" ||
      !Number.isSafeInteger(value.command.expectedVersion) ||
      !["SUBSCRIBED", "UNSUBSCRIBED", "IGNORED"].includes(value.command.state)
    ) {
      throw new Error();
    }
    return value;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

export default function RepositorySubscriptionControl({
  liffId,
  ownerLogin,
  repositoryName,
}: {
  liffId: string;
  ownerLogin: string;
  repositoryName: string;
}) {
  const [data, setData] = useState<RepositorySubscriptionSnapshot | null>(null);
  const [pending, setPending] = useState<PendingSubscription | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const locked = useRef(false);
  const key = storageKey(ownerLogin, repositoryName);

  function clear() {
    generation.current += 1;
    setData(null);
    setPending(null);
    setBusy(false);
    setError("");
    setNotice("");
  }

  async function session() {
    const token = await liffClient.session(liffId);
    if (!token) throw Object.assign(new Error("請完成 LINE 登入後重試。"), { status: 401 });
    return token;
  }

  async function requestView(token: string) {
    const query = new URLSearchParams({ owner: ownerLogin, name: repositoryName });
    const response = await fetch("/api/repository-subscription?" + query.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: { "x-line-token": token },
    });
    const payload = (await response.json()) as RepositorySubscriptionSnapshot & { error?: string };
    if (!response.ok || !payload?.repository?.id) {
      throw Object.assign(new Error(payload.error ?? "Repository subscription 讀取失敗。"), {
        status: response.status,
      });
    }
    return payload;
  }

  async function load(keepNotice = false) {
    if (locked.current) return;
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    if (!keepNotice) setNotice("");
    try {
      const token = await session();
      const snapshot = await requestView(token);
      if (ticket !== generation.current || (await liffClient.session(liffId)) !== token) return;
      setData(snapshot);
      setPending(readPending(key, token, snapshot.repository.id));
    } catch (cause) {
      if (ticket === generation.current) {
        setData(null);
        setPending(null);
        setError(cause instanceof Error ? cause.message : "Repository subscription 讀取失敗。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  async function execute(operation: PendingSubscription) {
    if (locked.current) return;
    locked.current = true;
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const token = await session();
      const fresh = await requestView(token);
      if (
        ticket !== generation.current ||
        fresh.repository.id !== operation.command.repositoryId ||
        (await liffClient.session(liffId)) !== token
      ) {
        sessionStorage.removeItem(key);
        setPending(null);
        throw Object.assign(new Error("LINE 身分或 Repository 讀取權限已變更。"), {
          status: 403,
        });
      }
      const owned = { ...operation, owner: token };
      sessionStorage.setItem(key, JSON.stringify(owned));
      setPending(owned);
      const response = await fetch("/api/repository-subscription", {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "content-type": "application/json",
          "x-line-token": token,
        },
        body: JSON.stringify(operation.command),
      });
      const payload = (await response.json()) as Partial<RepositorySubscriptionSnapshot> & {
        requestId?: string;
        repositoryId?: string;
        state?: RepositorySubscriptionState;
        version?: number;
        error?: string;
      };
      if (ticket !== generation.current || (await liffClient.session(liffId)) !== token) {
        throw new Error("LINE 身分已變更；請重新讀取並確認原操作結果。");
      }
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) {
          sessionStorage.removeItem(key);
          setPending(null);
        }
        throw Object.assign(new Error(payload.error ?? "Repository subscription 更新失敗。"), {
          status: response.status,
        });
      }
      if (
        payload.requestId !== operation.command.requestId ||
        payload.repositoryId !== operation.command.repositoryId ||
        payload.state !== operation.command.state ||
        !Number.isSafeInteger(payload.version)
      ) {
        throw new Error("Repository subscription 回執不完整，請重試原操作。");
      }
      sessionStorage.removeItem(key);
      setPending(null);
      setNotice("Repository subscription 已更新。");
    } catch (cause) {
      if (ticket === generation.current) {
        setData(null);
        setError(cause instanceof Error ? cause.message : "結果尚待確認，請重試原操作。");
      }
    } finally {
      locked.current = false;
      if (ticket === generation.current) setBusy(false);
    }
    if (ticket === generation.current) await load(true);
  }

  const onVisibilityChange = useEffectEvent(() => {
    clear();
    if (document.visibilityState === "visible") void load();
  });
  const onPageHide = useEffectEvent(clear);
  useEffect(() => {
    const visibilityChange = () => onVisibilityChange();
    const pagehide = () => onPageHide();
    document.addEventListener("visibilitychange", visibilityChange);
    window.addEventListener("pagehide", pagehide);
    return () => {
      generation.current += 1;
      document.removeEventListener("visibilitychange", visibilityChange);
      window.removeEventListener("pagehide", pagehide);
    };
  }, []);

  function setState(state: RepositorySubscriptionState) {
    if (!data || state === data.state) return;
    void execute({
      owner: "",
      command: {
        action: "set",
        requestId: crypto.randomUUID(),
        repositoryId: data.repository.id,
        expectedVersion: data.version,
        state,
      },
    });
  }

  return (
    <section className="crud-detail">
      <MiniAppRuntime liffId={liffId} onReady={() => load()} onWait={clear} />
      <h2>Watch</h2>
      {busy && <p role="status">處理中…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {pending && !busy && (
        <button type="button" onClick={() => void execute(pending)}>
          重試原 subscription 操作
        </button>
      )}
      {data && (
        <>
          <label>
            Subscription
            <select
              value={data.state}
              disabled={busy || Boolean(pending)}
              onChange={(event) => setState(event.target.value as RepositorySubscriptionState)}
            >
              <option value="SUBSCRIBED">SUBSCRIBED · 所有對話通知</option>
              <option value="UNSUBSCRIBED">UNSUBSCRIBED · 只保留參與／@mention 通知</option>
              <option value="IGNORED">IGNORED · 不通知</option>
            </select>
          </label>
          <p className="crud-lifecycle-note">
            Watch 不授予 Repository access，也不是 Star、Team notification setting 或 Notification delivery。
          </p>
        </>
      )}
    </section>
  );
}
