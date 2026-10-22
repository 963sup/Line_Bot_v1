"use client";

import type {
  RepositorySubscriptionCommand,
  RepositorySubscriptionSnapshot,
  RepositorySubscriptionState,
} from "@line_bot_v1/repository/contracts/input/repository-subscription";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { errorMessage, isRecord } from "./response-validation";

type PendingSubscription = Readonly<{
  owner: string;
  command: RepositorySubscriptionCommand;
}>;

function storageKey(ownerLogin: string, repositoryName: string) {
  return "repository-subscription:" + ownerLogin.toLowerCase() + "/" + repositoryName.toLowerCase();
}

function isSubscriptionState(value: unknown): value is RepositorySubscriptionState {
  return value === "SUBSCRIBED" || value === "UNSUBSCRIBED" || value === "IGNORED";
}

function isPendingSubscription(value: unknown): value is PendingSubscription {
  return (
    isRecord(value) &&
    typeof value.owner === "string" &&
    isRecord(value.command) &&
    value.command.action === "set" &&
    typeof value.command.requestId === "string" &&
    typeof value.command.repositoryId === "string" &&
    Number.isSafeInteger(value.command.expectedVersion) &&
    isSubscriptionState(value.command.state)
  );
}

function isSubscriptionSnapshot(value: unknown): value is RepositorySubscriptionSnapshot {
  return (
    isRecord(value) &&
    isRecord(value.repository) &&
    typeof value.repository.id === "string" &&
    typeof value.repository.actorUserId === "string" &&
    typeof value.repository.ownerLogin === "string" &&
    typeof value.repository.name === "string" &&
    isSubscriptionState(value.state) &&
    Number.isSafeInteger(value.version)
  );
}

function readPending(key: string, owner: string, repositoryId: string): PendingSubscription | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      !isPendingSubscription(value) ||
      value.owner !== owner ||
      value.command.repositoryId !== repositoryId ||
      !isSubscriptionState(value.command.state)
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
  explicitInteraction = false,
}: {
  liffId: string;
  ownerLogin: string;
  repositoryName: string;
  explicitInteraction?: boolean;
}) {
  const [data, setData] = useState<RepositorySubscriptionSnapshot | null>(null);
  const [pending, setPending] = useState<PendingSubscription | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activated, setActivated] = useState(false);
  const generation = useRef(0);
  const locked = useRef(false);
  const key = storageKey(ownerLogin, repositoryName);
  const runtimeEnabled = !explicitInteraction || activated;

  function clear() {
    generation.current += 1;
    setData(null);
    setPending(null);
    setBusy(false);
    setError("");
    setNotice("");
  }

  async function session() {
    const token = await liffClient.ensureSession(liffId);
    if (!token) throw Object.assign(new Error("請完成 LINE 登入後重試。"), { status: 401 });
    return token;
  }

  async function requestView(token: string) {
    const query = new URLSearchParams({ owner: ownerLogin, name: repositoryName });
    const response = await fetch("/api/repository-subscription?" + query.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: { "X-App-Session-Generation": token },
    });
    const payload: unknown = await response.json();
    if (!response.ok || !isSubscriptionSnapshot(payload)) {
      throw Object.assign(new Error(errorMessage(payload, "Repository subscription 讀取失敗。")), {
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
      if (ticket !== generation.current || (await liffClient.ensureSession(liffId)) !== token)
        return;
      setData(snapshot);
      setPending(readPending(key, snapshot.repository.actorUserId, snapshot.repository.id));
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
        fresh.repository.actorUserId !== operation.owner ||
        fresh.repository.id !== operation.command.repositoryId ||
        (await liffClient.ensureSession(liffId)) !== token
      ) {
        sessionStorage.removeItem(key);
        setPending(null);
        throw Object.assign(new Error("LINE 身分或 Repository 讀取權限已變更。"), {
          status: 403,
        });
      }
      sessionStorage.setItem(key, JSON.stringify(operation));
      setPending(operation);
      const response = await fetch("/api/repository-subscription", {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "content-type": "application/json",
          "X-App-Session-Generation": token,
        },
        body: JSON.stringify(operation.command),
      });
      const payload: unknown = await response.json();
      if (ticket !== generation.current || (await liffClient.ensureSession(liffId)) !== token) {
        throw new Error("LINE 身分已變更；請重新讀取並確認原操作結果。");
      }
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) {
          sessionStorage.removeItem(key);
          setPending(null);
        }
        throw Object.assign(
          new Error(errorMessage(payload, "Repository subscription 更新失敗。")),
          {
            status: response.status,
          },
        );
      }
      if (
        !isRecord(payload) ||
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
    if (runtimeEnabled && document.visibilityState === "visible") void load();
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
      owner: data.repository.actorUserId,
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
      {runtimeEnabled && <MiniAppRuntime liffId={liffId} onReady={() => load()} onWait={clear} />}
      <h2>Watch</h2>
      {!runtimeEnabled && (
        <>
          <p className="crud-lifecycle-note">登入後可設定這個 Repository 的追蹤偏好。</p>
          <button type="button" className="secondary" onClick={() => setActivated(true)}>
            設定追蹤偏好
          </button>
        </>
      )}
      {busy && <p role="status">處理中…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {pending && !busy && (
        <button type="button" onClick={() => void execute(pending)}>
          重試原 subscription 操作
        </button>
      )}
      {runtimeEnabled && data && (
        <>
          <label>
            Subscription
            <select
              value={data.state}
              disabled={busy || Boolean(pending)}
              onChange={(event) => {
                if (isSubscriptionState(event.target.value)) setState(event.target.value);
              }}
            >
              <option value="SUBSCRIBED">追蹤</option>
              <option value="UNSUBSCRIBED">一般</option>
              <option value="IGNORED">忽略</option>
            </select>
          </label>
          <p className="crud-lifecycle-note">
            儲存你的追蹤偏好，不會改變 Repository 存取權。通知功能尚未啟用。
          </p>
        </>
      )}
    </section>
  );
}
