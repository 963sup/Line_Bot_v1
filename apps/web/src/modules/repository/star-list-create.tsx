"use client";

import type {
  RepositoryStarListCreateCommand,
  RepositoryStarListMutationResult,
} from "@line-work/repository/application/ports/star-lists";
import { useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { repositoryStarListPath } from "./resource-navigation";
import {
  clearPendingRepositoryStarListCreate,
  readPendingRepositoryStarListCreate,
  writePendingRepositoryStarListCreate,
} from "./star-list-pending-storage";

export default function RepositoryStarListCreate({ liffId }: { liffId: string }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState<RepositoryStarListCreateCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function clear() {
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
      await session();
      const stored = readPendingRepositoryStarListCreate(window.localStorage);
      if (stored) {
        setPending(stored);
        setName(stored.name);
        setDescription(stored.description);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "List 建立頁載入失敗。");
    } finally {
      setBusy(false);
    }
  }

  async function execute(command: RepositoryStarListCreateCommand) {
    setBusy(true);
    setError("");
    setPending(command);
    writePendingRepositoryStarListCreate(window.localStorage, command);
    try {
      const token = await session();
      const response = await fetch("/api/repositories/lists", {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "content-type": "application/json",
          "x-line-token": token,
        },
        body: JSON.stringify(command),
      });
      const payload = (await response.json()) as RepositoryStarListMutationResult & {
        error?: string;
      };
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) {
          clearPendingRepositoryStarListCreate(window.localStorage);
          setPending(null);
        }
        throw Object.assign(new Error(payload.error ?? "List 建立失敗。"), {
          status: response.status,
        });
      }
      if (!payload.id || payload.deleted) throw new Error("List 建立回應不完整。");
      clearPendingRepositoryStarListCreate(window.localStorage);
      setPending(null);
      if ((await liffClient.session(liffId)) !== token) {
        clear();
        return;
      }
      window.location.assign(repositoryStarListPath(payload.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "List 建立結果尚待確認，請重試原操作。");
    } finally {
      setBusy(false);
    }
  }

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
      {!pending && (
        <section className="crud-detail">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              void execute({
                requestId: crypto.randomUUID(),
                name,
                description,
              });
            }}
          >
            <label>
              List name
              <input
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={busy}
                placeholder="Operations"
              />
            </label>
            <label>
              Description
              <textarea
                maxLength={500}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={busy}
                placeholder="這個 List 收錄什麼？"
              />
            </label>
            <p className="crud-lifecycle-note">
              新 List 固定以 private 建立。完成內容後，再由 List detail 明確 Publish。
            </p>
            <button disabled={busy || !name.trim()}>建立 List</button>
          </form>
        </section>
      )}
    </div>
  );
}
