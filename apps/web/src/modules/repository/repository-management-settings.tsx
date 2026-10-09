"use client";

import type {
  RepositoryManagementCommand,
  RepositoryManagementReceipt,
  RepositoryManagementSnapshot,
} from "@line_bot_v1/repository/contracts/repositories/management";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { repositorySettingsPath } from "./resource-navigation";

type PendingManagement = Readonly<{
  owner: string;
  command: RepositoryManagementCommand;
}>;

function storageKey(ownerLogin: string, repositoryName: string) {
  return "repository-management:" + ownerLogin.toLowerCase() + "/" + repositoryName.toLowerCase();
}

function readPending(
  key: string,
  actorUserId: string,
  repositoryId: string,
): PendingManagement | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingManagement;
    if (
      !value ||
      value.owner !== actorUserId ||
      !value.command ||
      value.command.repositoryId !== repositoryId ||
      !["rename", "visibility", "archive", "unarchive"].includes(value.command.action) ||
      typeof value.command.requestId !== "string" ||
      !Number.isSafeInteger(value.command.expectedVersion)
    ) {
      throw new Error();
    }
    return value;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

export default function RepositoryManagementSettings({
  liffId,
  ownerLogin,
  repositoryName,
}: {
  liffId: string;
  ownerLogin: string;
  repositoryName: string;
}) {
  const [data, setData] = useState<RepositoryManagementSnapshot | null>(null);
  const [pending, setPending] = useState<PendingManagement | null>(null);
  const [name, setName] = useState(repositoryName);
  const [visibility, setVisibility] =
    useState<RepositoryManagementSnapshot["repository"]["visibility"]>("private");
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
    const token = await liffClient.ensureSession(liffId);
    if (!token) throw Object.assign(new Error("請完成 LINE 登入後重試。"), { status: 401 });
    return token;
  }

  async function requestView(token: string) {
    const query = new URLSearchParams({ owner: ownerLogin, name: repositoryName });
    const response = await fetch("/api/repository-management?" + query.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: { "X-App-Session-Generation": token },
    });
    const payload = (await response.json()) as RepositoryManagementSnapshot & { error?: string };
    if (!response.ok || !payload?.repository?.actorUserId) {
      throw Object.assign(new Error(payload.error ?? "Repository 設定讀取失敗。"), {
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
      setName(snapshot.repository.name);
      setVisibility(snapshot.repository.visibility);
      setPending(readPending(key, snapshot.repository.actorUserId, snapshot.repository.id));
    } catch (cause) {
      if (ticket === generation.current) {
        setData(null);
        setPending(null);
        setError(cause instanceof Error ? cause.message : "Repository 設定讀取失敗。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  async function execute(operation: PendingManagement) {
    if (locked.current) return;
    locked.current = true;
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    let renameTo: string | null = null;
    try {
      const token = await session();
      const fresh = await requestView(token);
      if (
        ticket !== generation.current ||
        fresh.repository.actorUserId !== operation.owner ||
        fresh.repository.id !== operation.command.repositoryId ||
        !fresh.repository.actorPermissions.includes("admin") ||
        (await liffClient.ensureSession(liffId)) !== token
      ) {
        sessionStorage.removeItem(key);
        setPending(null);
        throw Object.assign(new Error("LINE 身分或 Repository admin 權限已變更。"), {
          status: 403,
        });
      }
      sessionStorage.setItem(key, JSON.stringify(operation));
      setPending(operation);

      const response = await fetch("/api/repository-management", {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "content-type": "application/json",
          "X-App-Session-Generation": token,
        },
        body: JSON.stringify(operation.command),
      });
      const payload = (await response.json()) as Partial<RepositoryManagementReceipt> & {
        error?: string;
      };
      if (ticket !== generation.current || (await liffClient.ensureSession(liffId)) !== token) {
        throw new Error("LINE 身分已變更；請重新讀取並確認原操作結果。");
      }
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) {
          sessionStorage.removeItem(key);
          setPending(null);
        }
        throw Object.assign(new Error(payload.error ?? "Repository 設定更新失敗。"), {
          status: response.status,
        });
      }
      if (
        payload.requestId !== operation.command.requestId ||
        payload.repositoryId !== operation.command.repositoryId ||
        payload.action !== operation.command.action ||
        !payload.name ||
        !Number.isSafeInteger(payload.version)
      ) {
        throw new Error("Repository 設定回執不完整，請重試原操作。");
      }
      sessionStorage.removeItem(key);
      setPending(null);
      setNotice("Repository 設定已更新。");
      if (operation.command.action === "rename") renameTo = payload.name;
    } catch (cause) {
      if (ticket === generation.current) {
        setData(null);
        setError(cause instanceof Error ? cause.message : "結果尚待確認，請重試原操作。");
      }
    } finally {
      locked.current = false;
      if (ticket === generation.current) setBusy(false);
    }

    if (renameTo) {
      window.location.assign(repositorySettingsPath(ownerLogin, renameTo));
      return;
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

  const repository = data?.repository;
  const canManage = repository?.actorPermissions.includes("admin") === true;
  const internalAllowed =
    repository?.ownerKind === "ORGANIZATION" && repository.internalEnterpriseId !== null;

  function command(
    next:
      | { action: "rename"; name: string }
      | { action: "visibility"; visibility: "private" | "internal" | "public" }
      | { action: "archive" | "unarchive" },
  ) {
    if (!repository) return;
    void execute({
      owner: repository.actorUserId,
      command: {
        requestId: crypto.randomUUID(),
        repositoryId: repository.id,
        expectedVersion: repository.version,
        ...next,
      } as RepositoryManagementCommand,
    });
  }

  return (
    <section className="crud-detail">
      <MiniAppRuntime liffId={liffId} onReady={() => load()} onWait={clear} />
      <h2>Repository lifecycle</h2>
      {busy && <p role="status">處理中…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {pending && !busy && (
        <section className="crud-guidance">
          <p>上一筆 Repository 設定操作結果尚待確認；重試會沿用原 requestId。</p>
          <button type="button" onClick={() => void execute(pending)}>
            重試原操作
          </button>
        </section>
      )}
      {repository && (
        <>
          <p>
            Visibility：{repository.visibility.toUpperCase()} ·{" "}
            {repository.archived ? "ARCHIVED" : "ACTIVE"}
          </p>
          <p>
            所有權：{repository.ownerKind === "USER" ? "Personal User" : "Organization"} ·{" "}
            {repository.ownerLogin}
          </p>
          <p className="crud-lifecycle-note">
            Repository lifecycle 只由當下有效的 Repository ADMIN 管理；OrganizationOwner 不會因
            組織角色自動取得這個 Repository 的操作權。
          </p>
          {repository.internalEnterpriseId && (
            <p>INTERNAL scope：Enterprise {repository.internalEnterpriseId}</p>
          )}
          {canManage ? (
            <>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (name.trim() && name.trim() !== repository.name) {
                    command({ action: "rename", name: name.trim() });
                  }
                }}
              >
                <label>
                  Repository name
                  <input
                    value={name}
                    maxLength={100}
                    required
                    disabled={busy || Boolean(pending)}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  disabled={
                    busy || Boolean(pending) || !name.trim() || name.trim() === repository.name
                  }
                >
                  重新命名
                </button>
              </form>

              <label>
                Visibility
                <select
                  value={visibility}
                  disabled={busy || Boolean(pending)}
                  onChange={(event) => setVisibility(event.target.value as typeof visibility)}
                >
                  <option value="private">PRIVATE</option>
                  <option value="public">PUBLIC</option>
                  <option value="internal" disabled={!internalAllowed}>
                    INTERNAL
                  </option>
                </select>
              </label>
              <button
                type="button"
                disabled={busy || Boolean(pending) || visibility === repository.visibility}
                onClick={() => command({ action: "visibility", visibility })}
              >
                更新 Visibility
              </button>

              <button
                type="button"
                className="secondary"
                disabled={busy || Boolean(pending)}
                onClick={() => command({ action: repository.archived ? "unarchive" : "archive" })}
              >
                {repository.archived ? "解除封存" : "封存 Repository"}
              </button>
              <p className="crud-lifecycle-note">
                封存後內容仍依目前 visibility/access 可讀，但 Issue
                協作與新打卡會停止；解除封存不會恢復已撤銷的 grant。
              </p>
            </>
          ) : (
            <p>只有 current Repository admin 可以修改 lifecycle 設定。</p>
          )}
        </>
      )}
    </section>
  );
}
