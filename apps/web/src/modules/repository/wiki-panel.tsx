"use client";
import { record } from "@line_bot_v1/platform/validation";
import { parseWikiCommand, type WikiCommand } from "@line_bot_v1/wiki/application/commands/pages";
import type { WikiPageSummary } from "@line_bot_v1/wiki/contracts/dto/wiki";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import RepositoryPageHeader from "./repository-page-header";
import { repositoryPath } from "./resource-navigation";
import styles from "./wiki-panel.module.css";
import { wikiComparison, wikiHistory, wikiPages, wikiRevision, wikiScope } from "./wiki-response";

type Pending = { actor: string; command: WikiCommand };
export default function WikiPanel({
  liffId,
  ownerLogin,
  repositoryName,
  pageId,
}: {
  liffId: string;
  ownerLogin: string;
  repositoryName: string;
  pageId?: string;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<ReturnType<typeof wikiScope> | null>(null);
  const [head, setHead] = useState<ReturnType<typeof wikiRevision> | null>(null);
  const [shown, setShown] = useState<ReturnType<typeof wikiRevision> | null>(null);
  const [pages, setPages] = useState<WikiPageSummary[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [history, setHistory] = useState<ReturnType<typeof wikiHistory> | null>(null);
  const [comparison, setComparison] = useState<ReturnType<typeof wikiComparison> | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const generation = useRef(0),
    locked = useRef(false),
    scopeRef = useRef(scope),
    pendingRef = useRef(pending);
  scopeRef.current = scope;
  pendingRef.current = pending;
  const base = `${repositoryPath(ownerLogin, repositoryName)}/wiki`;
  const key = `wiki:${ownerLogin.toLowerCase()}/${repositoryName.toLowerCase()}/${pageId ?? "new"}`;
  const request = useCallback(
    async (extra: Record<string, string> = {}, command?: WikiCommand) => {
      const token = await liffClient.ensureSession(liffId);
      if (!token) throw new Error("請完成 LINE 登入。");
      const query = new URLSearchParams({
        owner: ownerLogin,
        name: repositoryName,
        ...(pageId ? { pageId } : {}),
        ...extra,
      });
      const response = await fetch(`/api/repository-wiki?${query}`, {
        method: command ? "POST" : "GET",
        cache: "no-store",
        headers: {
          "X-App-Session-Generation": token,
          ...(command ? { "Content-Type": "application/json" } : {}),
        },
        ...(command ? { body: JSON.stringify(command) } : {}),
      });
      const value: unknown = await response.json();
      if (!response.ok) {
        const v = record(value);
        throw Object.assign(
          new Error(typeof v.error === "string" ? v.error : "Wiki 暫時不可用。"),
          { status: response.status },
        );
      }
      return value;
    },
    [liffId, ownerLogin, repositoryName, pageId],
  );
  function remember(value: Pending | null) {
    pendingRef.current = value;
    setPending(value);
    if (value) sessionStorage.setItem(key, JSON.stringify(value));
    else sessionStorage.removeItem(key);
  }
  const clear = useCallback(() => {
    generation.current++;
    scopeRef.current = null;
    pendingRef.current = null;
    setScope(null);
    setHead(null);
    setShown(null);
    setHistory(null);
    setComparison(null);
    setPages([]);
    setNext(null);
    setEditing(false);
    setDraftVersion(null);
    setTitle("");
    setBody("");
    setPending(null);
    setBusy(false);
  }, []);
  const load = useCallback(
    async (after?: string) => {
      const ticket = ++generation.current;
      setBusy(true);
      setError("");
      try {
        const value = await request(after ? { after } : {}),
          nextScope = wikiScope(value);
        if (ticket !== generation.current) return;
        if (scopeRef.current && scopeRef.current.actorUserId !== nextScope.actorUserId) {
          clear();
          return;
        }
        scopeRef.current = nextScope;
        setScope(nextScope);
        if (pageId) {
          const revision = wikiRevision(record(value).revision);
          setHead(revision);
          setShown(revision);
          setHistory(null);
          setComparison(null);
        } else {
          const list = wikiPages(value);
          setPages((current) => (after ? [...current, ...list.pages] : list.pages));
          setNext(list.next);
        }
        const raw = sessionStorage.getItem(key);
        if (raw) {
          try {
            const saved = record(JSON.parse(raw)),
              command = parseWikiCommand(saved.command);
            if (
              saved.actor !== nextScope.actorUserId ||
              command.repositoryId !== nextScope.repository.id ||
              (pageId ? command.pageId !== pageId : command.action !== "create")
            )
              throw new Error();
            const restored = { actor: nextScope.actorUserId, command };
            pendingRef.current = restored;
            setPending(restored);
            if (command.action === "create" || command.action === "edit") {
              setTitle(command.title);
              setBody(command.body);
              setEditing(true);
              setDraftVersion(command.expectedVersion);
            }
          } catch {
            sessionStorage.removeItem(key);
            pendingRef.current = null;
            setPending(null);
          }
        }
      } catch (cause) {
        if (ticket === generation.current) {
          clear();
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      } finally {
        if (ticket === generation.current) setBusy(false);
      }
    },
    [request, pageId, key, clear],
  );
  const visibility = useEffectEvent(() => {
    clear();
    if (document.visibilityState === "visible") void load();
  });
  useEffect(() => {
    const onVisibility = () => visibility();
    const unsubscribe = liffClient.onSessionBlocked(clear);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", clear);
    return () => {
      generation.current++;
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", clear);
    };
  }, [clear]);
  async function save(action: WikiCommand["action"], revisionId?: string) {
    if (locked.current || !scopeRef.current) return;
    locked.current = true;
    const ticket = generation.current;
    setBusy(true);
    setError("");
    try {
      const fresh = wikiScope(await request());
      if (ticket !== generation.current) return;
      const current = scopeRef.current,
        saved = pendingRef.current;
      if (
        !current ||
        fresh.actorUserId !== (saved?.actor ?? current.actorUserId) ||
        fresh.repository.id !== current.repository.id
      ) {
        clear();
        throw new Error("登入身分或 Repository 已改變，請重新讀取。");
      }
      const command: WikiCommand =
        saved?.command ??
        parseWikiCommand({
          action,
          repositoryId: fresh.repository.id,
          pageId: pageId ?? crypto.randomUUID(),
          requestId: crypto.randomUUID(),
          expectedVersion:
            action === "create" || action === "edit" || action === "rename"
              ? (draftVersion ?? 0)
              : (head?.version ?? 0),
          ...(action === "create" || action === "edit"
            ? { title, body }
            : action === "rename"
              ? { title }
              : action === "restore"
                ? { revisionId }
                : {}),
        });
      remember({ actor: fresh.actorUserId, command });
      const result = record(await request({}, command));
      const revision = wikiRevision(result.revision);
      if (ticket !== generation.current) return;
      if (
        result.requestId !== command.requestId ||
        revision.pageId !== command.pageId ||
        revision.repositoryId !== command.repositoryId
      )
        throw new Error("Wiki 儲存結果無法確認，請重試原操作。");
      remember(null);
      setEditing(false);
      setDraftVersion(null);
      setHistory(null);
      setComparison(null);
      if (!pageId) router.push(`${base}/${encodeURIComponent(revision.pageId)}`);
      else await load();
    } catch (cause) {
      if (ticket === generation.current) {
        const status =
          cause && typeof cause === "object" && "status" in cause ? Number(cause.status) : 0;
        if ([401, 403, 404].includes(status)) clear();
        else if ([400, 409, 413, 415].includes(status)) remember(null);
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      locked.current = false;
      if (ticket === generation.current) setBusy(false);
    }
  }
  async function inspect(
    mode: "history" | "page" | "compare",
    revisionId?: string,
    before?: number,
  ) {
    const ticket = generation.current;
    setBusy(true);
    setError("");
    try {
      const value = await request({
        view: mode,
        ...(revisionId
          ? mode === "compare"
            ? { beforeId: revisionId, afterId: head?.id ?? "" }
            : { revisionId }
          : {}),
        ...(before ? { before: String(before) } : {}),
      });
      if (ticket !== generation.current) return;
      if (wikiScope(value).actorUserId !== scopeRef.current?.actorUserId) {
        clear();
        return;
      }
      if (mode === "history") {
        const data = wikiHistory(value);
        setHistory((current) =>
          before && current
            ? { revisions: [...current.revisions, ...data.revisions], next: data.next }
            : data,
        );
      } else if (mode === "page") {
        setShown(wikiRevision(record(value).revision));
        setEditing(false);
        setComparison(null);
      } else setComparison(wikiComparison(value));
    } catch (cause) {
      if (ticket === generation.current) {
        clear();
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }
  const historical = shown && head && shown.id !== head.id;
  return (
    <>
      <RepositoryPageHeader
        ownerLogin={ownerLogin}
        repositoryName={repositoryName}
        active="wiki"
        canManage={scope?.canManageRepository ?? false}
      />
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      <div className={styles.actions}>
        <button disabled={busy} onClick={() => void load()}>
          重新讀取 Wiki
        </button>
        {pageId && <Link href={base}>返回頁面清單</Link>}
      </div>
      {busy && <p role="status">正在處理 Wiki…</p>}
      {error && <p role="alert">{error}</p>}
      {!scope && !busy && !error && <p>請完成 LINE 登入以查看 Wiki。</p>}
      {scope?.archived && <p>Repository 已封存，Wiki 為唯讀。</p>}
      {pending && (
        <div role="status">
          <p>有待確認操作；重試將沿用原始內容與版本。</p>
          <button disabled={busy} onClick={() => void save(pending.command.action)}>
            重試原操作
          </button>
          <button
            disabled={busy}
            onClick={() => {
              remember(null);
              setEditing(false);
              void load();
            }}
          >
            停止重試並重新讀取
          </button>
        </div>
      )}
      {scope && !pageId && (
        <section className={styles.panel}>
          <h2>Wiki 頁面</h2>
          {pages.length ? (
            <ul>
              {pages.map((page) => (
                <li key={page.pageId}>
                  <Link href={`${base}/${encodeURIComponent(page.pageId)}`}>{page.title}</Link> ·
                  版本 {page.version}
                  {page.archived ? " · 已封存" : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p>尚無 Wiki 頁面。</p>
          )}
          {next && (
            <button disabled={busy} onClick={() => void load(next)}>
              載入更多頁面
            </button>
          )}
          {scope.canEdit && !pending && (
            <button
              disabled={busy}
              onClick={() => {
                setTitle("");
                setBody("");
                setEditing(true);
                setDraftVersion(0);
              }}
            >
              建立頁面
            </button>
          )}
        </section>
      )}
      {shown && (
        <section className={styles.panel}>
          <h2>{shown.title}</h2>
          <p>
            {historical ? "歷史版本（唯讀）" : "目前版本"}：{shown.version}
            {shown.archived ? " · 已封存" : ""}
          </p>
          <pre className={styles.markdown}>{shown.body}</pre>
          <p>保存 Markdown 原文；不執行 HTML 或渲染外部內容。</p>
          <div className={styles.actions}>
            {scope?.canEdit && !pending && !historical && !shown.archived && (
              <>
                <button
                  disabled={busy}
                  onClick={() => {
                    setTitle(shown.title);
                    setBody(shown.body);
                    setEditing(true);
                    setDraftVersion(shown.version);
                  }}
                >
                  編輯頁面
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (confirm("封存此頁面？歷史內容仍保留。")) void save("archive");
                  }}
                >
                  封存頁面
                </button>
              </>
            )}
            <button disabled={busy} onClick={() => void inspect("history")}>
              查看歷史
            </button>
            {historical && scope?.canEdit && !pending && (
              <button disabled={busy} onClick={() => void save("restore", shown.id)}>
                還原此版本為新版本
              </button>
            )}
          </div>
        </section>
      )}
      {editing && scope?.canEdit && (
        <section className={styles.panel}>
          <h2>{pageId ? "編輯 Wiki" : "建立 Wiki"}</h2>
          {pageId && (
            <p>
              草稿基於版本 {draftVersion}；目前讀取版本 {head?.version}
              。重新讀取不會改變草稿的基準版本。
            </p>
          )}
          <label htmlFor="wiki-title">標題</label>
          <input
            id="wiki-title"
            value={title}
            maxLength={200}
            disabled={busy || !!pending}
            onChange={(event) => setTitle(event.target.value)}
          />
          <label htmlFor="wiki-body">Markdown 原文</label>
          <textarea
            id="wiki-body"
            value={body}
            maxLength={262144}
            disabled={busy || !!pending}
            onChange={(event) => setBody(event.target.value)}
          />
          <div className={styles.actions}>
            <button
              disabled={busy || !!pending}
              onClick={() => void save(pageId ? "edit" : "create")}
            >
              儲存頁面
            </button>
            {pageId && (
              <button disabled={busy || !!pending} onClick={() => void save("rename")}>
                僅改名
              </button>
            )}
            <button disabled={busy || !!pending} onClick={() => setEditing(false)}>
              取消編輯
            </button>
          </div>
        </section>
      )}
      {history && (
        <section className={styles.panel}>
          <h2>版本歷史</h2>
          <ul>
            {history.revisions.map((revision) => (
              <li key={revision.id}>
                版本 {revision.version} · {revision.action}{" "}
                <button disabled={busy} onClick={() => void inspect("page", revision.id)}>
                  查看版本 {revision.version}
                </button>
                <button disabled={busy} onClick={() => void inspect("compare", revision.id)}>
                  比較版本 {revision.version} 與目前版本
                </button>
              </li>
            ))}
          </ul>
          {history.next && (
            <button
              disabled={busy}
              onClick={() => void inspect("history", undefined, history.next ?? undefined)}
            >
              載入更多歷史
            </button>
          )}
        </section>
      )}
      {comparison && (
        <section className={styles.panel}>
          <h2>版本差異</h2>
          {comparison.length ? (
            comparison.map((item) => (
              <div key={item.field}>
                <h3>{item.field}</h3>
                <p>之前</p>
                <pre className={styles.markdown}>{String(item.before)}</pre>
                <p>目前</p>
                <pre className={styles.markdown}>{String(item.after)}</pre>
              </div>
            ))
          ) : (
            <p>內容相同。</p>
          )}
        </section>
      )}
    </>
  );
}
