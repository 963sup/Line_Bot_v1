"use client";

import type {
  RepositoryCreateCommand,
  RepositoryCreationResult,
  RepositoryOwnerOption,
} from "@line_bot_v1/repository/contracts/repositories/creation";
import { useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import {
  clearPendingRepositoryCreate,
  readPendingRepositoryCreate,
  writePendingRepositoryCreate,
} from "./repository-create-pending-storage";
import { repositoryPath } from "./resource-navigation";

export default function RepositoryCreate({ liffId }: { liffId: string }) {
  const [owners, setOwners] = useState<readonly RepositoryOwnerOption[] | null>(null);
  const [ownerAccountId, setOwnerAccountId] = useState("");
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<RepositoryCreateCommand["visibility"]>("private");
  const [pending, setPending] = useState<RepositoryCreateCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function clear() {
    setOwners(null);
    setOwnerAccountId("");
    setError("");
  }

  async function session() {
    const token = await liffClient.ensureSession(liffId);
    if (!token) throw Object.assign(new Error("請完成 LINE 登入後重試。"), { status: 401 });
    return token;
  }

  async function load() {
    setBusy(true);
    setError("");
    try {
      const token = await session();
      const response = await fetch("/api/repositories/owners", {
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: { "X-App-Session-Generation": token },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw Object.assign(new Error(payload.error ?? "Repository owner 讀取失敗。"), {
          status: response.status,
        });
      }
      if (!payload || !Array.isArray(payload.items))
        throw new Error("Repository owner 回應不完整。");
      const items = payload.items as RepositoryOwnerOption[];
      setOwners(items);
      setOwnerAccountId((current) => current || items[0]?.id || "");
      const stored = readPendingRepositoryCreate(window.localStorage);
      if (stored) {
        setPending(stored);
        setName(stored.name);
        setOwnerAccountId(stored.ownerAccountId);
        setVisibility(stored.visibility);
      }
    } catch (cause) {
      const status = (cause as { status?: number }).status;
      if (status === 401 || status === 403) clear();
      setError(cause instanceof Error ? cause.message : "Repository owner 讀取失敗。");
    } finally {
      setBusy(false);
    }
  }

  async function execute(command: RepositoryCreateCommand) {
    setBusy(true);
    setError("");
    setPending(command);
    writePendingRepositoryCreate(window.localStorage, command);
    try {
      const token = await session();
      const response = await fetch("/api/repositories", {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "content-type": "application/json",
          "X-App-Session-Generation": token,
        },
        body: JSON.stringify(command),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) {
          clearPendingRepositoryCreate(window.localStorage);
          setPending(null);
        }
        throw Object.assign(new Error(payload.error ?? "Repository 建立失敗。"), {
          status: response.status,
        });
      }
      const created = payload as RepositoryCreationResult;
      if (!created.ownerLogin || !created.name || !created.id) {
        throw new Error("Repository 建立回應不完整。");
      }
      clearPendingRepositoryCreate(window.localStorage);
      setPending(null);
      window.location.assign(repositoryPath(created.ownerLogin, created.name));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Repository 建立結果尚待確認，請重試原操作。",
      );
    } finally {
      setBusy(false);
    }
  }

  const selectedOwner = owners?.find((owner) => owner.id === ownerAccountId);

  return (
    <div className="crud-manager">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      {busy && <p role="status">處理中…</p>}
      {error && <p role="alert">{error}</p>}
      {pending && !busy && (
        <section className="crud-guidance">
          <p>上次建立結果尚待確認。重試會使用同一 requestId，不會重複建立。</p>
          <button type="button" onClick={() => void execute(pending)}>
            重試原操作
          </button>
        </section>
      )}
      {owners && !pending && (
        <section className="crud-detail">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedOwner || !name.trim()) return;
              void execute({
                requestId: crypto.randomUUID(),
                ownerAccountId: selectedOwner.id,
                ownerKind: selectedOwner.kind,
                name,
                visibility,
              });
            }}
          >
            <label>
              Owner
              <select
                value={ownerAccountId}
                onChange={(event) => {
                  const nextOwnerId = event.target.value;
                  setOwnerAccountId(nextOwnerId);
                  const nextOwner = owners.find((owner) => owner.id === nextOwnerId);
                  if (visibility === "internal" && !nextOwner?.internalEligible) {
                    setVisibility("private");
                  }
                }}
                disabled={busy}
              >
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    @{owner.login} · {owner.kind === "USER" ? "Personal" : "Organization"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Repository name
              <input
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={busy}
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="work-notes"
              />
            </label>
            <label>
              Visibility
              <select
                value={visibility}
                disabled={busy}
                onChange={(event) =>
                  setVisibility(event.target.value as RepositoryCreateCommand["visibility"])
                }
              >
                <option value="private">PRIVATE · explicit access only</option>
                <option value="public">PUBLIC · visible to everyone</option>
                <option value="internal" disabled={!selectedOwner?.internalEligible}>
                  INTERNAL · same active Enterprise only
                </option>
              </select>
            </label>
            <p className="crud-lifecycle-note">
              INTERNAL 只適用於目前連結 active Enterprise 的 Organization owner；visibility 不會建立
              RepositoryPermission grant。
            </p>
            <button disabled={busy || !selectedOwner || !name.trim()}>建立 Repository</button>
          </form>
        </section>
      )}
    </div>
  );
}
