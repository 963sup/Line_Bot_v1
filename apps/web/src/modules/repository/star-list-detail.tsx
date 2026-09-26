"use client";

import type { RepositoryStarListDetail as RepositoryStarListDetailValue } from "@line-work/repository/application/ports/star-lists";
import type { StarredRepository } from "@line-work/repository/application/ports/stars";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import {
  repositoryPath,
  repositoryStarListsPath,
} from "./resource-navigation";
import {
  clearPendingRepositoryStarListCommand,
  type RepositoryStarListCommandBody,
  readPendingRepositoryStarListCommand,
  writePendingRepositoryStarListCommand,
} from "./star-list-pending-storage";

export default function RepositoryStarListDetail({
  liffId,
  listId,
}: {
  liffId: string;
  listId: string;
}) {
  const [item, setItem] = useState<RepositoryStarListDetailValue | null>(null);
  const [starred, setStarred] = useState<StarredRepository[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [repositoryId, setRepositoryId] = useState("");
  const [pending, setPending] = useState<RepositoryStarListCommandBody | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0);

  function clear() {
    generation.current++;
    setItem(null);
    setStarred([]);
    setBusy(false);
    setError("");
    setNotice("");
  }

  async function session() {
    const token = await liffClient.session(liffId);
    if (!token) throw Object.assign(new Error("請完成 LINE 登入後重試。"), { status: 401 });
    return token;
  }

  async function read(token: string) {
    const response = await fetch(`/api/repositories/lists/${encodeURIComponent(listId)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: { "x-line-token": token },
    });
    const payload = (await response.json()) as {
      item?: RepositoryStarListDetailValue;
      error?: string;
    };
    if (!response.ok || !payload.item) {
      throw Object.assign(new Error(payload.error ?? "List 讀取失敗。"), {
        status: response.status,
      });
    }
    let stars: StarredRepository[] = [];
    if (payload.item.editable) {
      const starredResponse = await fetch("/api/repositories/starred", {
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: { "x-line-token": token },
      });
      const starredPayload = (await starredResponse.json()) as {
        items?: StarredRepository[];
        error?: string;
      };
      if (!starredResponse.ok || !Array.isArray(starredPayload.items)) {
        throw new Error(starredPayload.error ?? "Starred Repositories 讀取失敗。");
      }
      stars = starredPayload.items;
    }
    setItem(payload.item);
    setStarred(stars);
    setName(payload.item.name);
    setDescription(payload.item.description);
    const currentIds = new Set(payload.item.repositories.map((repository) => repository.id));
    setRepositoryId(stars.find((repository) => !currentIds.has(repository.id))?.id ?? "");
  }

  async function load() {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const token = await session();
      await read(token);
      if ((await liffClient.session(liffId)) !== token || ticket !== generation.current) return;
      setPending(readPendingRepositoryStarListCommand(window.localStorage, listId));
    } catch (cause) {
      if (ticket === generation.current) {
        setError(cause instanceof Error ? cause.message : "List 讀取失敗。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  async function execute(command: RepositoryStarListCommandBody) {
    setBusy(true);
    setError("");
    setNotice("");
    setPending(command);
    writePendingRepositoryStarListCommand(window.localStorage, listId, command);
    try {
      const token = await session();
      const response = await fetch(`/api/repositories/lists/${encodeURIComponent(listId)}`, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "content-type": "application/json",
          "x-line-token": token,
        },
        body: JSON.stringify(command),
      });
      const payload = (await response.json()) as {
        deleted?: boolean;
        error?: string;
      };
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) {
          clearPendingRepositoryStarListCommand(window.localStorage, listId);
          setPending(null);
          if (response.status === 409) await read(token);
        }
        throw Object.assign(new Error(payload.error ?? "List 操作失敗。"), {
          status: response.status,
        });
      }
      clearPendingRepositoryStarListCommand(window.localStorage, listId);
      setPending(null);
      if (payload.deleted) {
        window.location.assign(repositoryStarListsPath());
        return;
      }
      if ((await liffClient.session(liffId)) !== token) {
        clear();
        return;
      }
      await read(token);
      setNotice("List 已更新。");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "List 操作結果尚待確認，請重試原操作。",
      );
    } finally {
      setBusy(false);
    }
  }

  const onVisibilityChange = useEffectEvent(() => {
    if (document.visibilityState === "hidden") clear();
    else void load();
  });

  useEffect(() => {
    const visibility = () => onVisibilityChange();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      generation.current++;
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  const currentIds = new Set(item?.repositories.map((repository) => repository.id) ?? []);
  const available = starred.filter((repository) => !currentIds.has(repository.id));

  return (
    <div className="crud-manager">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      {busy && <p role="status">處理中…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {pending && !busy && (
        <section className="crud-guidance">
          <p>上次操作結果尚待確認。重試會使用同一 requestId 與 payload。</p>
          <button type="button" onClick={() => void execute(pending)}>
            重試原操作
          </button>
        </section>
      )}
      {item && (
        <section className="crud-detail">
          <div className="crud-detail-head">
            <div>
              <span className="crud-kicker">@{item.ownerLogin}</span>
              <h2>{item.name}</h2>
              <p>
                {item.visibility} · {item.visibleRepositoryCount} visible repositories
              </p>
            </div>
          </div>
          {item.description && <p>{item.description}</p>}

          {item.editable && (
            <>
              <h3>List settings</h3>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!name.trim() || pending) return;
                  void execute({
                    requestId: crypto.randomUUID(),
                    action: "update",
                    expectedVersion: item.version,
                    name,
                    description,
                  });
                }}
              >
                <label>
                  Name
                  <input
                    required
                    maxLength={100}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={busy || Boolean(pending)}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    maxLength={500}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    disabled={busy || Boolean(pending)}
                  />
                </label>
                <button disabled={busy || Boolean(pending) || !name.trim()}>儲存</button>
              </form>
              <div className="star-list-actions">
                <button
                  type="button"
                  disabled={busy || Boolean(pending)}
                  onClick={() =>
                    void execute({
                      requestId: crypto.randomUUID(),
                      action: item.visibility === "public" ? "unpublish" : "publish",
                      expectedVersion: item.version,
                    })
                  }
                >
                  {item.visibility === "public" ? "設為 Private" : "Publish"}
                </button>
              </div>
            </>
          )}

          <h3>Repositories</h3>
          {item.repositories.length === 0 ? (
            <p className="empty-copy">目前沒有你可見的 Repository。</p>
          ) : (
            <ul className="relationship-list">
              {item.repositories.map((repository) => (
                <li key={repository.id}>
                  <span>
                    <Link href={repositoryPath(repository.ownerLogin, repository.name)}>
                      <strong>
                        {repository.ownerLogin}/{repository.name}
                      </strong>
                    </Link>
                    <small>{repository.visibility}</small>
                  </span>
                  {item.editable && (
                    <button
                      type="button"
                      disabled={busy || Boolean(pending)}
                      onClick={() =>
                        void execute({
                          requestId: crypto.randomUUID(),
                          action: "remove",
                          expectedVersion: item.version,
                          repositoryId: repository.id,
                        })
                      }
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {item.editable && (
            <>
              <h3>Add starred Repository</h3>
              {available.length === 0 ? (
                <p className="empty-copy">
                  沒有其他目前可存取且已 Star 的 Repository 可加入。
                </p>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!repositoryId || pending) return;
                    void execute({
                      requestId: crypto.randomUUID(),
                      action: "add",
                      expectedVersion: item.version,
                      repositoryId,
                    });
                  }}
                >
                  <label>
                    Repository
                    <select
                      value={repositoryId}
                      onChange={(event) => setRepositoryId(event.target.value)}
                      disabled={busy || Boolean(pending)}
                    >
                      {available.map((repository) => (
                        <option key={repository.id} value={repository.id}>
                          {repository.ownerLogin}/{repository.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button disabled={busy || Boolean(pending) || !repositoryId}>加入 List</button>
                </form>
              )}

              <h3>Delete List</h3>
              <p className="crud-lifecycle-note">
                Delete 只刪除 List 與 memberships，不會刪除 Repository 或 Star。
              </p>
              <button
                type="button"
                className="danger-action"
                disabled={busy || Boolean(pending)}
                onClick={() => {
                  if (!window.confirm("Delete this List?")) return;
                  void execute({
                    requestId: crypto.randomUUID(),
                    action: "delete",
                    expectedVersion: item.version,
                  });
                }}
              >
                Delete List
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}
