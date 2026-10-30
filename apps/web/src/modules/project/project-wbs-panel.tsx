"use client";

import { parseProjectWbsCommand } from "@line_bot_v1/wbs/application/commands/project-content";
import type {
  ProjectWbsCommand,
  ProjectWbsHistory,
  ProjectWbsView,
} from "@line_bot_v1/wbs/contracts/dto/project-content";
import {
  projectWbsHistory,
  projectWbsReceipt,
  projectWbsView,
} from "@line_bot_v1/wbs/contracts/parse-project-content-response";
import type { WbsContentImportCommand, WbsEdit, WbsNode } from "@line_bot_v1/wbs/domain/document";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import ProjectWbsGovernancePanel from "./project-wbs-governance-panel";
import ProjectWbsMetrics from "./project-wbs-metrics";
import styles from "./project-wbs-panel.module.css";

type Pending = { actor: string; command: ProjectWbsCommand };
type NewWbsCommand =
  | WbsEdit
  | Omit<WbsContentImportCommand, "projectId" | "requestId" | "expectedVersion">;
export default function ProjectWbsPanel({
  liffId,
  projectId,
}: {
  liffId: string;
  projectId: string;
}) {
  const [view, setView] = useState<ProjectWbsView | null>(null);
  const [draft, setDraft] = useState<WbsNode | null>(null);
  const [creating, setCreating] = useState(false);
  const [history, setHistory] = useState<ProjectWbsHistory | null>(null);
  const [historical, setHistorical] = useState(false);
  const [moveParent, setMoveParent] = useState("");
  const [contentRepositoryId, setContentRepositoryId] = useState("");
  const [contentRevisionId, setContentRevisionId] = useState("");
  const [contentDisclosureConfirmed, setContentDisclosureConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  const current = useRef<ProjectWbsView | null>(null);
  const lastActor = useRef<string | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const storageKey = `project-wbs:${projectId}`;
  const query = new URLSearchParams({ projectId }).toString();
  const endpoint = `/api/project-wbs?${query}`;

  function remember(value: Pending | null) {
    pendingRef.current = value;
    setPending(value);
    if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
    else sessionStorage.removeItem(storageKey);
  }
  async function request(url: string, command?: ProjectWbsCommand) {
    const token = await liffClient.ensureSession(liffId);
    if (!token) throw new Error("請完成 LINE 登入。");
    const response = await fetch(url, {
      method: command ? "POST" : "GET",
      cache: "no-store",
      headers: {
        "X-App-Session-Generation": token,
        ...(command ? { "Content-Type": "application/json" } : {}),
      },
      ...(command ? { body: JSON.stringify(command) } : {}),
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const message =
        body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : "WBS 服務暫時不可用。";
      throw Object.assign(new Error(message), { status: response.status });
    }
    return body;
  }
  const load = useCallback(async () => {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const token = await liffClient.ensureSession(liffId);
      if (!token) throw new Error("請完成 LINE 登入。");
      const response = await fetch(endpoint, {
        cache: "no-store",
        headers: { "X-App-Session-Generation": token },
      });
      const body: unknown = await response.json();
      if (!response.ok)
        throw Object.assign(
          new Error(
            body && typeof body === "object" && "error" in body && typeof body.error === "string"
              ? body.error
              : "WBS 讀取失敗。",
          ),
          { status: response.status },
        );
      const next = projectWbsView(body);
      if (ticket !== generation.current) return;
      if (lastActor.current && lastActor.current !== next.actorUserId) {
        setDraft(null);
        setHistory(null);
        pendingRef.current = null;
        setPending(null);
      }
      current.current = next;
      lastActor.current = next.actorUserId;
      setView(next);
      setHistorical(false);
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) {
          const saved: unknown = JSON.parse(raw);
          if (
            saved &&
            typeof saved === "object" &&
            "actor" in saved &&
            saved.actor === next.actorUserId &&
            "command" in saved
          ) {
            const command = parseProjectWbsCommand(saved.command);
            if (command.projectId !== next.project.id) throw new Error();
            pendingRef.current = { actor: next.actorUserId, command };
            setPending(pendingRef.current);
          } else if (raw) sessionStorage.removeItem(storageKey);
        }
      } catch {
        sessionStorage.removeItem(storageKey);
      }
    } catch (cause) {
      if (ticket === generation.current) {
        if (
          cause &&
          typeof cause === "object" &&
          "status" in cause &&
          [401, 403, 404].includes(Number(cause.status))
        ) {
          setHistory(null);
          setDraft(null);
          setPending(null);
          pendingRef.current = null;
          try {
            sessionStorage.removeItem(storageKey);
          } catch {
            /* State is already cleared in memory. */
          }
        }
        setError(cause instanceof Error ? cause.message : String(cause));
        setView(null);
        current.current = null;
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }, [endpoint, liffId, storageKey]);

  async function execute(edit?: NewWbsCommand) {
    const source = current.current;
    if (!source || locked.current || historical) return;
    locked.current = true;
    const ticket = generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = pendingRef.current;
      const operation =
        saved ??
        (edit
          ? {
              actor: source.actorUserId,
              command: {
                ...edit,
                projectId: source.project.id,
                expectedVersion: source.version,
                requestId: crypto.randomUUID(),
              },
            }
          : null);
      if (!operation) return;
      // Bind exact retries to the currently verified User; a changed session must never replay another User's operation.
      const verified = projectWbsView(await request(endpoint));
      if (ticket !== generation.current) return;
      if (
        verified.actorUserId !== operation.actor ||
        verified.project.id !== operation.command.projectId
      ) {
        clear();
        throw new Error("登入身分已改變，請重新載入。");
      }
      remember(operation);
      const receipt = projectWbsReceipt(await request("/api/project-wbs", operation.command));
      if (ticket !== generation.current) return;
      if (
        receipt.requestId !== operation.command.requestId ||
        receipt.projectId !== source.project.id
      )
        throw new Error("儲存結果無法確認，請重試原操作。");
      remember(null);
      setDraft(null);
      setHistory(null);
      setContentRepositoryId("");
      setContentRevisionId("");
      setContentDisclosureConfirmed(false);
      setNotice("草稿已儲存；正式範圍須經提案審查後發布。");
      await load();
    } catch (cause) {
      if (ticket !== generation.current) return;
      const status =
        cause && typeof cause === "object" && "status" in cause ? cause.status : undefined;
      if (status === 401 || status === 403 || status === 404) {
        remember(null);
        clear();
        setError(cause instanceof Error ? cause.message : String(cause));
        return;
      }
      if (typeof status === "number" && status >= 400 && status < 500) remember(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      locked.current = false;
      if (ticket === generation.current) setBusy(false);
    }
  }
  const clear = useCallback(() => {
    generation.current++;
    current.current = null;
    pendingRef.current = null;
    setView(null);
    setDraft(null);
    setPending(null);
    setHistory(null);
    setError("");
    setNotice("");
    setBusy(false);
    setHistorical(false);
  }, []);
  const governanceAccessLost = useCallback(
    (message: string) => {
      clear();
      setError(message);
    },
    [clear],
  );
  const onVisibility = useEffectEvent(() => {
    clear();
    if (document.visibilityState === "visible") void load();
  });
  const onBlocked = useEffectEvent(() => clear());
  useEffect(() => {
    const visibility = () => onVisibility();
    const pagehide = () => onBlocked();
    const unsubscribe = liffClient.onSessionBlocked(() => onBlocked());
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide);
    return () => {
      generation.current++;
      unsubscribe();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide);
    };
  }, []);
  async function showHistory(before?: number) {
    const ticket = generation.current;
    setBusy(true);
    setError("");
    try {
      const incoming = projectWbsHistory(
        await request(`/api/project-wbs/history?${query}${before ? `&before=${before}` : ""}`),
      );
      if (ticket === generation.current)
        setHistory((h) =>
          before && h
            ? { revisions: [...h.revisions, ...incoming.revisions], next: incoming.next }
            : incoming,
        );
    } catch (cause) {
      if (ticket === generation.current) {
        if (
          cause &&
          typeof cause === "object" &&
          "status" in cause &&
          (cause.status === 401 || cause.status === 403 || cause.status === 404)
        ) {
          remember(null);
          clear();
        }
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }
  async function openRevision(id: string) {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const next = projectWbsView(
        await request(`${endpoint}&revisionId=${encodeURIComponent(id)}`),
      );
      if (ticket === generation.current) {
        setView(next);
        setHistorical(true);
        setDraft(null);
      }
    } catch (cause) {
      if (ticket === generation.current) {
        if (
          cause &&
          typeof cause === "object" &&
          "status" in cause &&
          (cause.status === 401 || cause.status === 403 || cause.status === 404)
        ) {
          remember(null);
          clear();
        }
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }
  const nodes = view?.revision?.document.nodes ?? [];
  const editable = Boolean(view?.canEdit && !historical && !pending && !busy);
  function select(node: WbsNode) {
    setDraft({ ...node });
    setCreating(false);
    setMoveParent(node.parentId ?? "");
  }
  function tree(parentId: string | null, prefix = "") {
    return (
      <ol className={styles.tree}>
        {nodes
          .filter((n) => n.parentId === parentId)
          .sort((a, b) => a.position - b.position)
          .map((node, i) => (
            <li key={node.id}>
              <button
                type="button"
                disabled={busy || Boolean(pending)}
                onClick={() => select(node)}
              >
                {prefix}
                {i + 1} {node.title} {node.kind === "WORK_PACKAGE" ? "· 工作包" : ""}
              </button>
              {node.kind === "DELIVERABLE" && tree(node.id, `${prefix}${i + 1}.`)}
            </li>
          ))}
      </ol>
    );
  }
  return (
    <>
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      {error && (
        <p role="alert" className={styles.notice}>
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {view && !historical && (
        <ProjectWbsMetrics
          liffId={liffId}
          projectId={view.project.id}
          actorUserId={view.actorUserId}
          version={view.version}
          onAccessLost={governanceAccessLost}
        />
      )}
      {busy && <p role="status">處理中…</p>}
      {pending && (
        <div className={styles.notice}>
          <p>有一筆結果尚未確認的操作；確認前不能送出新修改。</p>
          <button disabled={busy} onClick={() => void execute()}>
            重試原操作
          </button>
        </div>
      )}
      <div className={styles.actions}>
        <button disabled={busy} onClick={() => void load()}>
          重新載入目前版本
        </button>
        {view?.revision && (
          <button disabled={busy} onClick={() => void showHistory()}>
            查看歷史
          </button>
        )}
      </div>
      {view && !view.revision && (
        <div className={styles.panel}>
          <h2>尚未建立 WBS</h2>
          <p>
            WBS 可由指定 Content 版本一次展開成草稿，或從空白結構開始建立；正式 Baseline
            需另行治理發布。
          </p>
          {editable && (
            <>
              <form
                className={styles.form}
                onSubmit={(event) => {
                  event.preventDefault();
                  void execute({
                    action: "import-content-document",
                    repositoryId: contentRepositoryId,
                    contentRevisionId,
                    confirmedDisclosure: true,
                  });
                }}
              >
                <label>
                  Content 所屬 Repository ID
                  <input
                    required
                    maxLength={128}
                    value={contentRepositoryId}
                    onChange={(event) => setContentRepositoryId(event.target.value)}
                  />
                </label>
                <label>
                  Content 版本 ID
                  <input
                    required
                    inputMode="text"
                    value={contentRevisionId}
                    onChange={(event) => setContentRevisionId(event.target.value)}
                  />
                </label>
                <label>
                  <input
                    required
                    type="checkbox"
                    checked={contentDisclosureConfirmed}
                    onChange={(event) => setContentDisclosureConfirmed(event.target.checked)}
                  />
                  我確認此 Content 已授權披露給此 Project，並建立 WBS 草稿。
                </label>
                <button type="submit">從 Content 建立 WBS 草稿</button>
              </form>
              <button onClick={() => void execute({ action: "initialize" })}>建立空白 WBS</button>
            </>
          )}
        </div>
      )}
      {view?.closed && <p>Project 已關閉，WBS 僅供讀取。</p>}
      {view?.revision && (
        <>
          <p>
            {historical ? "歷史版本（唯讀）" : "目前版本"}：{view.revision.version}
          </p>
          <div className={styles.layout}>
            <section className={styles.panel} aria-label="WBS 結構">
              {editable && (
                <button
                  onClick={() => {
                    setDraft({
                      id: crypto.randomUUID(),
                      parentId: null,
                      position: nodes.filter((n) => n.parentId === null).length,
                      kind: "WORK_PACKAGE",
                      title: "",
                      description: "",
                      deliverable: "",
                      acceptanceCriteria: "",
                    });
                    setCreating(true);
                  }}
                >
                  新增節點
                </button>
              )}
              {nodes.length ? tree(null) : <p>尚無節點。</p>}
            </section>
            <section className={styles.panel}>
              {draft ? (
                <>
                  <form
                    className={styles.form}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void execute({
                        action: creating ? "create-node" : "update-node",
                        node: draft,
                      });
                    }}
                  >
                    <label>
                      標題
                      <input
                        required
                        maxLength={200}
                        value={draft.title}
                        disabled={!editable}
                        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      />
                    </label>
                    <label>
                      類型
                      <select
                        value={draft.kind}
                        disabled={!editable}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            kind: e.target.value === "DELIVERABLE" ? "DELIVERABLE" : "WORK_PACKAGE",
                          })
                        }
                      >
                        <option value="DELIVERABLE">交付分解節點</option>
                        <option value="WORK_PACKAGE">工作包</option>
                      </select>
                    </label>
                    {creating && (
                      <label>
                        父節點
                        <select
                          value={draft.parentId ?? ""}
                          disabled={!editable}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              parentId: e.target.value || null,
                              position: nodes.filter((n) => n.parentId === (e.target.value || null))
                                .length,
                            })
                          }
                        >
                          <option value="">最上層</option>
                          {nodes
                            .filter((n) => n.kind === "DELIVERABLE")
                            .map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.title}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    <label>
                      說明
                      <textarea
                        maxLength={10000}
                        value={draft.description}
                        disabled={!editable}
                        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                      />
                    </label>
                    <label>
                      交付成果
                      <textarea
                        maxLength={10000}
                        value={draft.deliverable}
                        disabled={!editable}
                        onChange={(e) => setDraft({ ...draft, deliverable: e.target.value })}
                      />
                    </label>
                    <label>
                      驗收要求
                      <textarea
                        maxLength={10000}
                        value={draft.acceptanceCriteria}
                        disabled={!editable}
                        onChange={(e) => setDraft({ ...draft, acceptanceCriteria: e.target.value })}
                      />
                    </label>
                    {draft.kind === "WORK_PACKAGE" &&
                      (!draft.deliverable.trim() || !draft.acceptanceCriteria.trim()) && (
                        <p>草稿尚缺交付成果或驗收要求。</p>
                      )}
                    {editable && <button type="submit">儲存內容</button>}
                  </form>
                  {!creating && editable && (
                    <div className={styles.actions}>
                      <button
                        onClick={() =>
                          void execute({
                            action: "move-node",
                            nodeId: draft.id,
                            parentId: draft.parentId,
                            position: Math.max(0, draft.position - 1),
                          })
                        }
                      >
                        上移
                      </button>
                      <button
                        onClick={() =>
                          void execute({
                            action: "move-node",
                            nodeId: draft.id,
                            parentId: draft.parentId,
                            position: draft.position + 1,
                          })
                        }
                      >
                        下移
                      </button>
                      <label>
                        移至父節點
                        <select value={moveParent} onChange={(e) => setMoveParent(e.target.value)}>
                          <option value="">最上層</option>
                          {nodes
                            .filter((n) => n.kind === "DELIVERABLE" && n.id !== draft.id)
                            .map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.title}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button
                        onClick={() =>
                          void execute({
                            action: "move-node",
                            nodeId: draft.id,
                            parentId: moveParent || null,
                            position: nodes.filter((n) => n.parentId === (moveParent || null))
                              .length,
                          })
                        }
                      >
                        移動
                      </button>
                      <button
                        onClick={() => {
                          const descendants = new Set([draft.id]);
                          for (let i = 0; i < nodes.length; i++)
                            for (const n of nodes)
                              if (n.parentId && descendants.has(n.parentId)) descendants.add(n.id);
                          if (
                            window.confirm(
                              `刪除「${draft.title}」及其子節點，共 ${descendants.size} 個節點？歷史版本會保留。`,
                            )
                          )
                            void execute({ action: "delete-subtree", nodeId: draft.id });
                        }}
                      >
                        刪除子樹
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p>選擇節點查看內容，或新增工作包。</p>
              )}
            </section>
          </div>
        </>
      )}
      {view?.revision && !historical && (
        <ProjectWbsGovernancePanel
          key={`${view.actorUserId}:${view.project.id}`}
          liffId={liffId}
          projectId={view.project.id}
          actorUserId={view.actorUserId}
          draftRevisionId={view.revision.id}
          disabled={busy || Boolean(pending)}
          onAccessLost={governanceAccessLost}
        />
      )}
      {view && history && (
        <section className={styles.panel} aria-label="WBS 歷史">
          <h2>版本歷史</h2>
          <ul>
            {history.revisions.map((r) => (
              <li key={r.id}>
                <button disabled={busy || Boolean(pending)} onClick={() => void openRevision(r.id)}>
                  版本 {r.version} · {r.action} · {new Date(r.at).toLocaleString()}
                </button>
              </li>
            ))}
          </ul>
          {history.next !== null && (
            <button disabled={busy} onClick={() => void showHistory(history.next ?? undefined)}>
              載入更多歷史
            </button>
          )}
        </section>
      )}
    </>
  );
}
