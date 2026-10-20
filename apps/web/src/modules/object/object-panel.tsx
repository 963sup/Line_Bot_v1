"use client";

import type { ObjectTreeDto } from "@line_bot_v1/resources/contracts/dto/objects";
import Link from "next/link";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import EngineeringPanel from "./engineering-panel";
import { objectTree, structureView } from "./engineering-response";
import { appendCursorPage, objectTypeOptions } from "./object-pagination";
import styles from "./object-panel.module.css";
import {
  confirmsObjectReceipt,
  type ObjectCommand,
  type ObjectFamily,
  type PendingObjectCommand,
  parsePendingObjectCommand,
} from "./object-pending";
import {
  type ObjectRelationshipView,
  type ObjectRevisionView,
  type ObjectTypeView,
  objectComparison,
  objectHistory,
  objectRelationships,
  objectRevision,
  objectScope,
  objectTypes,
} from "./object-response";
import ObjectTree from "./object-tree";

const endpoint: Record<ObjectFamily, string> = {
  types: "/api/repository-object-types",
  objects: "/api/repository-objects",
  relationships: "/api/repository-object-relationships",
  measures: "/api/repository-object-measures",
};

export default function ObjectPanel({
  liffId,
  ownerLogin,
  repositoryName,
  objectId,
  basePath,
  onCanManageChange,
}: {
  liffId: string;
  ownerLogin: string;
  repositoryName: string;
  objectId?: string;
  basePath: string;
  onCanManageChange?: (canManage: boolean) => void;
}) {
  const [scope, setScope] = useState<ReturnType<typeof objectScope> | null>(null);
  const [types, setTypes] = useState<ObjectTypeView[]>([]);
  const [typesNext, setTypesNext] = useState<string | null>(null);
  const [treePage, setTreePage] = useState<ObjectTreeDto | null>(null);
  const [head, setHead] = useState<ObjectRevisionView | null>(null);
  const [shown, setShown] = useState<ObjectRevisionView | null>(null);
  const [history, setHistory] = useState<ObjectRevisionView[]>([]);
  const [historyNext, setHistoryNext] = useState<string | null>(null);
  const [comparison, setComparison] = useState<ReturnType<typeof objectComparison>>([]);
  const [relationships, setRelationships] = useState<ObjectRelationshipView[]>([]);
  const [relationshipsNext, setRelationshipsNext] = useState<string | null>(null);
  const [relationshipHistory, setRelationshipHistory] = useState<ObjectRelationshipView[]>([]);
  const [relationshipHistoryNext, setRelationshipHistoryNext] = useState<string | null>(null);
  const [relationshipHistoryId, setRelationshipHistoryId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingObjectCommand | null>(null);
  const [engineeringRefresh, setEngineeringRefresh] = useState(0);
  const [typeName, setTypeName] = useState("");
  const [typeDescription, setTypeDescription] = useState("");
  const [editingType, setEditingType] = useState<ObjectTypeView | null>(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [relationshipName, setRelationshipName] = useState("");
  const [targetObjectId, setTargetObjectId] = useState("");
  const [editingRelationship, setEditingRelationship] = useState<ObjectRelationshipView | null>(
    null,
  );
  const generation = useRef(0);
  const locked = useRef(false);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const storageKey = `objects:${ownerLogin.toLowerCase()}/${repositoryName.toLowerCase()}/${objectId ?? "list"}`;

  const clear = useCallback(() => {
    generation.current++;
    scopeRef.current = null;
    setScope(null);
    onCanManageChange?.(false);
    setTypes([]);
    setTypesNext(null);
    setTreePage(null);
    setHead(null);
    setShown(null);
    setHistory([]);
    setHistoryNext(null);
    setComparison([]);
    setRelationships([]);
    setRelationshipsNext(null);
    setRelationshipHistory([]);
    setRelationshipHistoryNext(null);
    setRelationshipHistoryId(null);
    setPending(null);
    setTypeName("");
    setTypeDescription("");
    setEditingType(null);
    setName("");
    setContent("");
    setSelectedTypeId("");
    setRelationshipName("");
    setTargetObjectId("");
    setEditingRelationship(null);
    setShowArchived(false);
    setError("");
    setBusy(false);
  }, [onCanManageChange]);

  const request = useCallback(
    async (
      family: ObjectFamily,
      query: Record<string, string> = {},
      command?: ObjectCommand,
      expectedSessionGeneration?: string,
      guard?: () => boolean,
    ) => {
      const generationToken = await liffClient.ensureSession(liffId);
      if (!generationToken) throw new Error("請完成 LINE 登入。");
      if (
        (expectedSessionGeneration && generationToken !== expectedSessionGeneration) ||
        (guard && !guard())
      )
        throw new Error("登入狀態已變更，已停止送出操作。");
      const search = new URLSearchParams({ owner: ownerLogin, name: repositoryName, ...query });
      const response = await fetch(`${endpoint[family]}?${search}`, {
        method: command ? "POST" : "GET",
        cache: "no-store",
        headers: {
          "X-App-Session-Generation": generationToken,
          ...(command ? { "Content-Type": "application/json" } : {}),
        },
        ...(command ? { body: JSON.stringify(command) } : {}),
      });
      const value: unknown = await response.json();
      if (!response.ok) {
        const message =
          value && typeof value === "object" && "error" in value && typeof value.error === "string"
            ? value.error
            : "Object 服務暫時不可用。";
        const code =
          value && typeof value === "object" && "code" in value && typeof value.code === "string"
            ? value.code
            : undefined;
        throw Object.assign(new Error(message), { status: response.status, code });
      }
      return value;
    },
    [liffId, ownerLogin, repositoryName],
  );

  const remember = useCallback(
    (value: PendingObjectCommand | null) => {
      setPending(value);
      if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
      else sessionStorage.removeItem(storageKey);
    },
    [storageKey],
  );

  const load = useCallback(
    async (archivedFilter = showArchived) => {
      const ticket = ++generation.current;
      setBusy(true);
      setError("");
      try {
        const [typeValue, objectValue, relationshipValue] = await Promise.all([
          request("types"),
          request(
            "objects",
            objectId ? { objectId } : { view: "tree", includeArchived: String(archivedFilter) },
          ),
          objectId ? request("relationships", { objectId }) : Promise.resolve(null),
        ]);
        if (ticket !== generation.current) return;
        const nextScope = objectScope(typeValue);
        if (scopeRef.current && scopeRef.current.actorUserId !== nextScope.actorUserId) {
          clear();
          return;
        }
        scopeRef.current = nextScope;
        setScope(nextScope);
        onCanManageChange?.(nextScope.canManageRepository);
        const typePage = objectTypes(typeValue);
        const nextTypes = typePage.types;
        setTypes(nextTypes);
        setTypesNext(typePage.next);
        setEngineeringRefresh((value) => value + 1);
        if (objectId) {
          const revision = objectRevision(
            objectValue && typeof objectValue === "object" && "revision" in objectValue
              ? objectValue.revision
              : undefined,
          );
          setHead(revision);
          setShown(revision);
          setHistory([]);
          setHistoryNext(null);
          setComparison([]);
          setRelationshipHistory([]);
          setRelationshipHistoryNext(null);
          setRelationshipHistoryId(null);
          setName(revision.name);
          setContent(revision.content);
          setSelectedTypeId(revision.typeId);
          if (relationshipValue) {
            const relationshipPage = objectRelationships(relationshipValue);
            setRelationships(relationshipPage.relationships);
            setRelationshipsNext(relationshipPage.next);
          }
        } else {
          setTreePage(objectTree(objectValue));
          if (!selectedTypeId) setSelectedTypeId(nextTypes.find((type) => type.enabled)?.id ?? "");
        }
        const saved = sessionStorage.getItem(storageKey);
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          const restored = parsePendingObjectCommand(
            parsed,
            nextScope.actorUserId,
            nextScope.repository.id,
            objectId,
          );
          if (!restored) throw new Error("discard-pending");
          setPending(restored);
        }
      } catch (cause) {
        if (ticket !== generation.current) return;
        if (cause instanceof Error && cause.message === "discard-pending") {
          sessionStorage.removeItem(storageKey);
          setPending(null);
        } else {
          clear();
          setError(cause instanceof Error ? cause.message : "Object 讀取失敗。");
        }
      } finally {
        if (ticket === generation.current) setBusy(false);
      }
    },
    [request, objectId, showArchived, clear, storageKey, selectedTypeId, onCanManageChange],
  );

  async function loadMore(family: "types" | "relationships") {
    const cursor = family === "types" ? typesNext : relationshipsNext;
    if (!cursor || (family === "relationships" && !objectId)) return;
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const value = await request(
        family,
        family === "types" ? { after: cursor } : { after: cursor, objectId: objectId ?? "" },
      );
      if (ticket !== generation.current) return;
      const currentScope = scopeRef.current;
      const nextScope = objectScope(value);
      if (
        !currentScope ||
        nextScope.actorUserId !== currentScope.actorUserId ||
        nextScope.repository.id !== currentScope.repository.id
      ) {
        clear();
        return;
      }
      if (family === "types") {
        const page = objectTypes(value);
        setTypes((current) => appendCursorPage(current, page.types, (type) => type.id));
        setTypesNext(page.next);
      } else {
        const page = objectRelationships(value);
        setRelationships((current) =>
          appendCursorPage(current, page.relationships, (relationship) => relationship.id),
        );
        setRelationshipsNext(page.next);
      }
    } catch (cause) {
      if (ticket === generation.current)
        setError(cause instanceof Error ? cause.message : "Object 分頁讀取失敗。");
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  const visibility = useEffectEvent(() => {
    clear();
    if (document.visibilityState === "visible") void load(false);
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

  async function mutate(
    family: ObjectFamily,
    commandFactory?: (
      fresh: ReturnType<typeof objectScope>,
    ) => ObjectCommand | Promise<ObjectCommand>,
  ) {
    if (locked.current) return;
    locked.current = true;
    const ticket = ++generation.current;
    const initialScope = scopeRef.current;
    setBusy(true);
    setError("");
    try {
      if (!initialScope) throw new Error("Object scope 已失效，請重新讀取。");
      const sessionGeneration = await liffClient.ensureSession(liffId);
      if (!sessionGeneration) throw new Error("請完成 LINE 登入。");
      if (ticket !== generation.current) return;
      const guard = () =>
        ticket === generation.current &&
        scopeRef.current?.actorUserId === initialScope.actorUserId &&
        scopeRef.current.repository.id === initialScope.repository.id;
      const fresh = objectScope(await request("types", {}, undefined, sessionGeneration, guard));
      if (ticket !== generation.current) return;
      const saved = pending;
      if (
        !scopeRef.current ||
        fresh.actorUserId !== (saved?.actorUserId ?? scopeRef.current.actorUserId) ||
        fresh.repository.id !== scopeRef.current.repository.id
      ) {
        clear();
        throw new Error("登入身分或 Repository 已改變，請重新讀取。");
      }
      const nextFamily = saved?.family ?? family;
      let command = saved?.command ?? (await commandFactory?.(fresh));
      if (!command) throw new Error("操作內容不存在。");
      if (!guard()) return;
      if (!saved && command.action === "restore" && objectId) {
        const structure = structureView(
          await request(
            "objects",
            { view: "structure", rootId: objectId },
            undefined,
            sessionGeneration,
            guard,
          ),
        );
        if (!guard()) return;
        command = { ...command, observed: structure.observed };
      }
      const nextPending = { actorUserId: fresh.actorUserId, family: nextFamily, command };
      remember(nextPending);
      const result = await request(nextFamily, {}, command, sessionGeneration, guard);
      const confirmedSessionGeneration = await liffClient.ensureSession(liffId);
      if (confirmedSessionGeneration !== sessionGeneration || !guard()) {
        clear();
        return;
      }
      if (!confirmsObjectReceipt(result, nextPending))
        throw new Error("Object 儲存結果無法確認，請重試原操作。");
      if (nextFamily === "types" && (command.action === "create" || command.action === "update")) {
        setEditingType(null);
        setTypeName("");
        setTypeDescription("");
      } else if (nextFamily === "objects" && command.action === "create") {
        setName("");
        setContent("");
        setSelectedTypeId("");
      } else if (
        nextFamily === "relationships" &&
        (command.action === "create" || command.action === "rename")
      ) {
        setEditingRelationship(null);
        setRelationshipName("");
        setTargetObjectId("");
      }
      remember(null);
      await load();
    } catch (cause) {
      if (ticket === generation.current) {
        const status =
          cause && typeof cause === "object" && "status" in cause ? Number(cause.status) : 0;
        if ([401, 403, 404].includes(status)) clear();
        else if ([400, 409, 413, 415].includes(status)) remember(null);
        setError(cause instanceof Error ? cause.message : "Object 儲存結果未知，請重試原操作。");
      }
    } finally {
      locked.current = false;
      if (ticket === generation.current) setBusy(false);
    }
  }

  async function inspectHistory(revisionId?: string, compare = false, before?: string) {
    if (!objectId || !scopeRef.current) return;
    const ticket = ++generation.current;
    const expectedScope = scopeRef.current;
    setBusy(true);
    setError("");
    try {
      if (revisionId && compare && head) {
        const value = await request("objects", {
          objectId,
          view: "compare",
          beforeId: revisionId,
          afterId: head.id,
        });
        if (ticket !== generation.current) return;
        const responseScope = objectScope(value);
        if (
          responseScope.actorUserId !== expectedScope.actorUserId ||
          responseScope.repository.id !== expectedScope.repository.id
        ) {
          clear();
          return;
        }
        setComparison(objectComparison(value));
      } else if (revisionId) {
        const value = await request("objects", { objectId, revisionId });
        if (ticket !== generation.current) return;
        const responseScope = objectScope(value);
        if (
          responseScope.actorUserId !== expectedScope.actorUserId ||
          responseScope.repository.id !== expectedScope.repository.id
        ) {
          clear();
          return;
        }
        setShown(
          objectRevision(
            value && typeof value === "object" && "revision" in value ? value.revision : undefined,
          ),
        );
        setComparison([]);
      } else {
        const value = await request("objects", {
          objectId,
          view: "history",
          ...(before ? { before } : {}),
        });
        if (ticket !== generation.current) return;
        const responseScope = objectScope(value);
        if (
          responseScope.actorUserId !== expectedScope.actorUserId ||
          responseScope.repository.id !== expectedScope.repository.id
        ) {
          clear();
          return;
        }
        const page = objectHistory(value);
        setHistory((current) =>
          before
            ? appendCursorPage(current, page.revisions, (revision) => revision.id)
            : page.revisions,
        );
        setHistoryNext(page.next);
      }
    } catch (cause) {
      if (ticket === generation.current)
        setError(cause instanceof Error ? cause.message : "Object 歷史讀取失敗。");
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  async function inspectRelationshipHistory(relationshipId: string, before?: string) {
    const expectedScope = scopeRef.current;
    if (!expectedScope) return;
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const value = await request("relationships", {
        view: "history",
        relationshipId,
        ...(before ? { before } : {}),
      });
      if (ticket !== generation.current) return;
      const responseScope = objectScope(value);
      if (
        responseScope.actorUserId !== expectedScope.actorUserId ||
        responseScope.repository.id !== expectedScope.repository.id
      ) {
        clear();
        return;
      }
      const page = objectRelationships(value);
      setRelationshipHistory((current) =>
        before
          ? appendCursorPage(current, page.relationships, (revision) => revision.id)
          : page.relationships,
      );
      setRelationshipHistoryNext(page.next);
      setRelationshipHistoryId(relationshipId);
    } catch (cause) {
      if (ticket === generation.current)
        setError(cause instanceof Error ? cause.message : "Relationship 歷史讀取失敗。");
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  const historical = shown && head && shown.id !== head.id;
  const detailTypeOptions = objectTypeOptions(
    types,
    head ? { typeId: head.typeId, typeName: head.typeName } : undefined,
  );
  return (
    <>
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      <div className={styles.actions}>
        <button
          type="button"
          disabled={busy}
          onClick={() => void load()}
          data-testid="objects-refresh"
        >
          重新讀取
        </button>
        {objectId ? <Link href={basePath}>返回 Objects</Link> : null}
      </div>
      {busy ? <p role="status">正在處理 Objects…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {scope?.archived ? <p>Repository 已封存，Objects 為唯讀。</p> : null}
      {pending ? (
        <section className={styles.panel} data-testid="object-pending-retry">
          <p>操作結果尚未確認；重試會沿用原始 request ID、內容與版本。</p>
          <div className={styles.actions}>
            <button type="button" disabled={busy} onClick={() => void mutate(pending.family)}>
              重試原操作
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                remember(null);
                void load();
              }}
            >
              停止重試並重新讀取
            </button>
          </div>
        </section>
      ) : null}

      {!objectId && scope ? (
        <>
          <details
            className={`${styles.panel} ${styles.typeDisclosure}`}
            data-testid="object-types"
          >
            <summary>
              <h2>Object Types</h2>
            </summary>
            {types.length ? (
              <ul className={styles.list}>
                {types.map((type) => (
                  <li key={type.id}>
                    {type.name} · 版本 {type.version} {type.enabled ? "" : "· 已停用"}
                    {scope.canManageTypes ? (
                      <>
                        <button
                          type="button"
                          disabled={busy || !!pending}
                          onClick={() => {
                            setEditingType(type);
                            setTypeName(type.name);
                            setTypeDescription(type.description);
                          }}
                        >
                          編輯
                        </button>
                        <button
                          type="button"
                          disabled={busy || !!pending}
                          onClick={() =>
                            void mutate("types", (fresh) => ({
                              action: type.enabled ? "disable" : "enable",
                              repositoryId: fresh.repository.id,
                              typeId: type.id,
                              requestId: crypto.randomUUID(),
                              expectedVersion: type.version,
                            }))
                          }
                        >
                          {type.enabled ? "停用" : "重新啟用"}
                        </button>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p>尚無 Object Type。</p>
            )}
            {typesNext ? (
              <button type="button" disabled={busy} onClick={() => void loadMore("types")}>
                載入更多 Object Types
              </button>
            ) : null}
            {scope.canManageTypes ? (
              <form
                className={styles.form}
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutate("types", (fresh) => ({
                    action: editingType ? "update" : "create",
                    repositoryId: fresh.repository.id,
                    typeId: editingType?.id ?? crypto.randomUUID(),
                    requestId: crypto.randomUUID(),
                    expectedVersion: editingType?.version ?? 0,
                    name: typeName,
                    description: typeDescription,
                  }));
                }}
              >
                <label htmlFor="object-type-name">
                  Type 名稱
                  <input
                    id="object-type-name"
                    maxLength={100}
                    required
                    value={typeName}
                    onChange={(event) => setTypeName(event.target.value)}
                  />
                </label>
                <label htmlFor="object-type-description">
                  Type 說明
                  <textarea
                    id="object-type-description"
                    maxLength={2000}
                    value={typeDescription}
                    onChange={(event) => setTypeDescription(event.target.value)}
                  />
                </label>
                <div className={styles.actions}>
                  <button type="submit" disabled={busy || !!pending}>
                    {editingType ? "儲存 Object Type" : "建立 Object Type"}
                  </button>
                  {editingType ? (
                    <button
                      type="button"
                      disabled={busy || !!pending}
                      onClick={() => {
                        setEditingType(null);
                        setTypeName("");
                        setTypeDescription("");
                      }}
                    >
                      取消編輯
                    </button>
                  ) : null}
                </div>
              </form>
            ) : null}
          </details>

          <section className={styles.panel} data-testid="object-list">
            <h2>Objects</h2>
            <label className={styles.archiveFilter}>
              <input
                type="checkbox"
                checked={showArchived}
                disabled={busy}
                onChange={(event) => {
                  const next = event.target.checked;
                  setShowArchived(next);
                  void load(next);
                }}
              />{" "}
              顯示已封存 Objects
            </label>
            {treePage ? (
              <ObjectTree
                key={`${scope.actorUserId}:${scope.repository.id}:${showArchived}`}
                page={treePage}
                basePath={basePath}
                scope={scope}
                types={types}
                busy={busy || !!pending}
                refresh={engineeringRefresh}
                includeArchived={showArchived}
                request={request}
                mutate={mutate}
                invalidate={clear}
              />
            ) : null}
            {scope.canEdit ? (
              <details className={styles.createDisclosure}>
                <summary aria-label="新增根 Object">＋ 新增 Object</summary>
                <form
                  className={styles.form}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void mutate("objects", (fresh) => ({
                      action: "create",
                      repositoryId: fresh.repository.id,
                      objectId: crypto.randomUUID(),
                      requestId: crypto.randomUUID(),
                      expectedVersion: 0,
                      typeId: selectedTypeId,
                      name,
                      content,
                    }));
                  }}
                >
                  <h3>建立 Object</h3>
                  <label htmlFor="object-type">
                    Object Type
                    <select
                      id="object-type"
                      required
                      value={selectedTypeId}
                      onChange={(event) => setSelectedTypeId(event.target.value)}
                    >
                      <option value="">選擇 Type</option>
                      {types
                        .filter((type) => type.enabled)
                        .map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label htmlFor="object-name">
                    名稱
                    <input
                      id="object-name"
                      maxLength={200}
                      required
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </label>
                  <label htmlFor="object-content">
                    內容
                    <textarea
                      id="object-content"
                      maxLength={262_144}
                      value={content}
                      onChange={(event) => setContent(event.target.value)}
                    />
                  </label>
                  <button type="submit" disabled={busy || !!pending || !selectedTypeId}>
                    建立 Object
                  </button>
                </form>
              </details>
            ) : null}
          </section>
        </>
      ) : null}

      {objectId && scope && shown && head ? (
        <>
          <section className={styles.panel} data-testid="object-detail">
            <h2>{shown.name}</h2>
            <p>
              {shown.typeName} · 版本 {shown.version}
              {shown.archived ? " · 已封存" : ""}
              {historical ? " · 歷史版本" : ""}
            </p>
            <pre className={styles.content}>{shown.content}</pre>
            {shown.quantity ? (
              <p>
                數量：{shown.quantity.value} · 計量定義 {shown.quantity.measureId} ·{" "}
                {shown.quantity.purpose === "REFERENCE" ? "參考基準" : "計畫數量"}
                <br />
                {shown.quantity.sourceReference
                  ? `固定來源 ${shown.quantity.sourceReference.objectId} / ${shown.quantity.sourceReference.revisionId}`
                  : "來源未登錄"}
              </p>
            ) : (
              <p>數量未登錄</p>
            )}
            <p className={styles.muted}>內容以純文字顯示，不執行 HTML。</p>
            <div className={styles.actions}>
              <button type="button" disabled={busy} onClick={() => void inspectHistory()}>
                查看版本歷史
              </button>
              {historical ? (
                <button type="button" disabled={busy} onClick={() => setShown(head)}>
                  返回目前版本
                </button>
              ) : null}
              {historical && scope.canEdit && !head.archived ? (
                <button
                  type="button"
                  disabled={busy || !!pending}
                  onClick={() =>
                    void mutate("objects", (fresh) => ({
                      action: "restore",
                      repositoryId: fresh.repository.id,
                      objectId,
                      revisionId: shown.id,
                      requestId: crypto.randomUUID(),
                      expectedVersion: head.version,
                    }))
                  }
                >
                  還原為新版本
                </button>
              ) : null}
            </div>
            {!historical && scope.canEdit ? (
              <form
                className={styles.form}
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutate("objects", (fresh) => ({
                    action: "edit",
                    repositoryId: fresh.repository.id,
                    objectId,
                    requestId: crypto.randomUUID(),
                    expectedVersion: head.version,
                    name,
                    content,
                  }));
                }}
              >
                <label htmlFor="object-detail-name">
                  名稱
                  <input
                    id="object-detail-name"
                    maxLength={200}
                    required
                    value={name}
                    disabled={head.archived}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label htmlFor="object-detail-content">
                  內容
                  <textarea
                    id="object-detail-content"
                    maxLength={262_144}
                    value={content}
                    disabled={head.archived}
                    onChange={(event) => setContent(event.target.value)}
                  />
                </label>
                <label htmlFor="object-detail-type">
                  Object Type
                  <select
                    id="object-detail-type"
                    value={selectedTypeId}
                    disabled={head.archived}
                    onChange={(event) => setSelectedTypeId(event.target.value)}
                  >
                    {detailTypeOptions
                      .filter((type) => type.enabled || type.current)
                      .map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                          {type.enabled ? "" : "（已停用）"}
                        </option>
                      ))}
                  </select>
                </label>
                {typesNext ? (
                  <button type="button" disabled={busy} onClick={() => void loadMore("types")}>
                    載入更多 Object Types
                  </button>
                ) : null}
                <div className={styles.actions}>
                  <button type="submit" disabled={busy || !!pending || head.archived}>
                    儲存內容
                  </button>
                  {selectedTypeId !== head.typeId ? (
                    <button
                      type="button"
                      disabled={busy || !!pending || head.archived}
                      onClick={() =>
                        void mutate("objects", (fresh) => ({
                          action: "reclassify",
                          repositoryId: fresh.repository.id,
                          objectId,
                          requestId: crypto.randomUUID(),
                          expectedVersion: head.version,
                          typeId: selectedTypeId,
                        }))
                      }
                    >
                      變更分類
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy || !!pending}
                    onClick={() =>
                      void mutate("objects", (fresh) => ({
                        action: head.archived ? "unarchive" : "archive",
                        repositoryId: fresh.repository.id,
                        objectId,
                        requestId: crypto.randomUUID(),
                        expectedVersion: head.version,
                      }))
                    }
                  >
                    {head.archived ? "取消封存" : "封存 Object"}
                  </button>
                </div>
              </form>
            ) : null}
          </section>

          {!historical ? (
            <EngineeringPanel
              key={`${scope.actorUserId}:${objectId}`}
              rootId={objectId}
              basePath={basePath}
              scope={scope}
              types={types}
              busy={busy || !!pending}
              refresh={engineeringRefresh}
              request={request}
              mutate={mutate}
              invalidate={clear}
            />
          ) : null}

          {history.length ? (
            <section className={styles.panel} data-testid="object-history">
              <h2>版本歷史</h2>
              <ul className={styles.list}>
                {history.map((revision) => (
                  <li key={revision.id}>
                    版本 {revision.version} · {revision.action}{" "}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void inspectHistory(revision.id)}
                    >
                      查看
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void inspectHistory(revision.id, true)}
                    >
                      與目前版本比較
                    </button>
                  </li>
                ))}
              </ul>
              {historyNext ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void inspectHistory(undefined, false, historyNext)}
                >
                  載入更多版本
                </button>
              ) : null}
            </section>
          ) : null}

          {comparison.length ? (
            <section className={styles.panel} data-testid="object-comparison">
              <h2>與目前版本比較</h2>
              {comparison.map((difference) => (
                <div key={difference.field}>
                  <h3>{difference.field}</h3>
                  <pre
                    className={styles.content}
                  >{`歷史：\n${String(difference.before)}\n目前：\n${String(difference.after)}`}</pre>
                </div>
              ))}
            </section>
          ) : null}

          <section className={styles.panel} data-testid="object-relationships">
            <h2>Object Relationships</h2>
            {relationships.length ? (
              <ul className={styles.list}>
                {relationships
                  .filter((relation) => relation.active)
                  .map((relation) => (
                    <li key={relation.relationshipId}>
                      {relation.sourceObjectId === objectId ? "Outgoing" : "Incoming"}:{" "}
                      {relation.sourceObjectId} → <strong>{relation.name}</strong> →{" "}
                      {relation.targetObjectId}
                      {scope.canEdit ? (
                        <>
                          <button
                            type="button"
                            disabled={busy || !!pending}
                            onClick={() => {
                              setEditingRelationship(relation);
                              setRelationshipName(relation.name);
                            }}
                          >
                            重新命名
                          </button>
                          <button
                            type="button"
                            disabled={busy || !!pending}
                            onClick={() =>
                              void mutate("relationships", (fresh) => ({
                                action: "remove",
                                repositoryId: fresh.repository.id,
                                relationshipId: relation.relationshipId,
                                requestId: crypto.randomUUID(),
                                expectedVersion: relation.version,
                              }))
                            }
                          >
                            移除
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void inspectRelationshipHistory(relation.relationshipId)}
                      >
                        查看關係歷史
                      </button>
                    </li>
                  ))}
              </ul>
            ) : (
              <p>尚無關係。</p>
            )}
            {relationshipsNext ? (
              <button type="button" disabled={busy} onClick={() => void loadMore("relationships")}>
                載入更多 Relationships
              </button>
            ) : null}
            {relationshipHistory.length ? (
              <div data-testid="object-relationship-history">
                <h3>Relationship 歷史</h3>
                <ul className={styles.list}>
                  {relationshipHistory.map((revision) => (
                    <li key={revision.id}>
                      版本 {revision.version} · {revision.action} · {revision.name}
                    </li>
                  ))}
                </ul>
                {relationshipHistoryNext && relationshipHistoryId ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void inspectRelationshipHistory(
                        relationshipHistoryId,
                        relationshipHistoryNext,
                      )
                    }
                  >
                    載入更多 Relationship 歷史
                  </button>
                ) : null}
              </div>
            ) : null}
            {scope.canEdit && !head.archived ? (
              <form
                className={styles.form}
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutate("relationships", (fresh) =>
                    editingRelationship
                      ? {
                          action: "rename",
                          repositoryId: fresh.repository.id,
                          relationshipId: editingRelationship.relationshipId,
                          requestId: crypto.randomUUID(),
                          expectedVersion: editingRelationship.version,
                          name: relationshipName,
                        }
                      : {
                          action: "create",
                          repositoryId: fresh.repository.id,
                          relationshipId: crypto.randomUUID(),
                          requestId: crypto.randomUUID(),
                          expectedVersion: 0,
                          sourceObjectId: objectId,
                          targetObjectId,
                          name: relationshipName,
                        },
                  );
                }}
              >
                <h3>
                  {editingRelationship ? "重新命名 Relationship" : "新增 Outgoing Relationship"}
                </h3>
                <label htmlFor="relationship-name">
                  關係名稱
                  <input
                    id="relationship-name"
                    maxLength={100}
                    required
                    value={relationshipName}
                    onChange={(event) => setRelationshipName(event.target.value)}
                  />
                </label>
                {!editingRelationship ? (
                  <label htmlFor="relationship-target">
                    Target Object ID
                    <input
                      id="relationship-target"
                      required
                      value={targetObjectId}
                      onChange={(event) => setTargetObjectId(event.target.value)}
                    />
                  </label>
                ) : null}
                <div className={styles.actions}>
                  <button type="submit" disabled={busy || !!pending}>
                    {editingRelationship ? "儲存關係名稱" : "建立關係"}
                  </button>
                  {editingRelationship ? (
                    <button
                      type="button"
                      disabled={busy || !!pending}
                      onClick={() => {
                        setEditingRelationship(null);
                        setRelationshipName("");
                      }}
                    >
                      取消重新命名
                    </button>
                  ) : null}
                </div>
              </form>
            ) : null}
          </section>
        </>
      ) : null}
    </>
  );
}
