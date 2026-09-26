"use client";

import type {
  RepositoryCreateCommand,
  RepositoryCreationResult,
  RepositoryOwnerOption,
} from "@line-work/repository/application/ports/creation";
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
  const [pending, setPending] = useState<RepositoryCreateCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function clear() {
    setOwners(null);
    setOwnerAccountId("");
    setError("");
  }

  async function session() {
    const token = await liffClient.session(liffId);
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
        headers: { "x-line-token": token },
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
          "x-line-token": token,
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
              });
            }}
          >
            <label>
              Owner
              <select
                value={ownerAccountId}
                onChange={(event) => setOwnerAccountId(event.target.value)}
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
            <p className="crud-lifecycle-note">
              新 Repository 目前固定建立為 private。Visibility 管理尚未啟用。
            </p>
            <button disabled={busy || !selectedOwner || !name.trim()}>建立 Repository</button>
          </form>
        </section>
      )}
    </div>
  );
}
