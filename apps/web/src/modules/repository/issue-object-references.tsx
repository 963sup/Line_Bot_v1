"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import {
  type AvailableObject,
  confirmPendingObjectReference,
  discardPendingObjectReference,
  type ObjectReferenceCommand,
  type PendingObjectReferenceOperation,
  postIssueObjectReference,
  requestAvailableObjects,
  requestIssueObjectReferences,
  restorePendingObjectReference,
  savePendingObjectReference,
} from "./issue-object-reference-requests";

type Loaded = Awaited<ReturnType<typeof requestIssueObjectReferences>>;

export default function IssueObjectReferences({
  liffId,
  ownerLogin,
  repositoryName,
  actorUserId,
  repositoryId,
  issueId,
  issueVersion,
  canManage,
  onUpdated,
}: {
  liffId: string;
  ownerLogin: string;
  repositoryName: string;
  actorUserId: string;
  repositoryId: string;
  issueId: string;
  issueVersion: number;
  canManage: boolean;
  onUpdated(): Promise<void>;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [objects, setObjects] = useState<readonly AvailableObject[]>([]);
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState<PendingObjectReferenceOperation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const verifiedScope = useRef<{
    actorUserId: string;
    repositoryId: string;
    issueId: string;
    token: string;
  } | null>(null);

  const clearAuthorizedState = useCallback(() => {
    generation.current += 1;
    verifiedScope.current = null;
    setLoaded(null);
    setObjects([]);
    setSelected("");
    setPending(null);
    setBusy(false);
    setError("");
  }, []);

  const load = useCallback(async () => {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const token = await liffClient.ensureSession(liffId);
      if (!token || ticket !== generation.current) return;
      const [references, available] = await Promise.all([
        requestIssueObjectReferences(token, repositoryId, issueId),
        canManage
          ? requestAvailableObjects(token, ownerLogin, repositoryName)
          : Promise.resolve({ actorUserId, repositoryId, items: [] }),
      ]);
      if (ticket !== generation.current) return;
      const tokenAfter = await liffClient.ensureSession(liffId);
      if (!tokenAfter || tokenAfter !== token || ticket !== generation.current) return;
      if (references.version !== issueVersion) {
        throw new Error("Issue 已更新，請重新載入後再管理 Object reference。");
      }
      if (available.actorUserId !== actorUserId || available.repositoryId !== repositoryId) {
        throw new Error("登入身分或 Repository 已改變，請重新讀取。");
      }
      verifiedScope.current = canManage ? { actorUserId, repositoryId, issueId, token } : null;
      setLoaded(references);
      setObjects(available.items);
      setPending(
        canManage
          ? restorePendingObjectReference(sessionStorage, actorUserId, repositoryId, issueId)
          : null,
      );
    } catch (cause) {
      if (ticket === generation.current) {
        verifiedScope.current = null;
        setLoaded(null);
        setObjects([]);
        setSelected("");
        setPending(null);
        setError(cause instanceof Error ? cause.message : "Object references 讀取失敗。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }, [
    actorUserId,
    canManage,
    issueId,
    issueVersion,
    liffId,
    ownerLogin,
    repositoryId,
    repositoryName,
  ]);

  useEffect(() => {
    void load();
    const onVisibility = () => {
      clearAuthorizedState();
      if (document.visibilityState === "visible") void load();
    };
    const unsubscribe = liffClient.onSessionBlocked(clearAuthorizedState);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", clearAuthorizedState);
    return () => {
      generation.current += 1;
      verifiedScope.current = null;
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", clearAuthorizedState);
    };
  }, [clearAuthorizedState, load]);

  async function execute(operation: PendingObjectReferenceOperation) {
    if (busy || !canManage) return;
    if (
      operation.actorUserId !== actorUserId ||
      operation.repositoryId !== repositoryId ||
      operation.issueId !== issueId
    ) {
      setPending(null);
      setError("LINE 使用者或 Issue 已切換，請重新讀取後再操作。");
      return;
    }
    const verified = verifiedScope.current;
    if (
      !verified ||
      verified.actorUserId !== operation.actorUserId ||
      verified.repositoryId !== operation.repositoryId ||
      verified.issueId !== operation.issueId
    ) {
      setError("登入身分或 Issue 尚未完成驗證，請重新讀取後再操作。");
      return;
    }
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const token = await liffClient.ensureSession(liffId);
      if (!token) throw new Error("請重新登入 LINE。");
      if (token !== verified.token) {
        clearAuthorizedState();
        throw new Error("LINE 使用者已切換，請以原帳號重新讀取後再重試。");
      }
      const result = await postIssueObjectReference(token, operation.command);
      const tokenAfter = await liffClient.ensureSession(liffId);
      if (ticket !== generation.current) return;
      if (!tokenAfter || tokenAfter !== token) {
        throw new Error("LINE 使用者已切換，請以原帳號重新讀取後再重試。");
      }
      if (!result.response.ok) {
        if (result.response.status < 500 && result.response.status !== 429) {
          if (discardPendingObjectReference(sessionStorage, operation)) setPending(null);
        }
        throw new Error(result.error || "結果尚未確認，請重試原操作。");
      }
      confirmPendingObjectReference(sessionStorage, operation, result.value);
      setPending(null);
      setSelected("");
      await onUpdated();
    } catch (cause) {
      if (ticket === generation.current) {
        setError(cause instanceof Error ? cause.message : "結果尚未確認，請重試原操作。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  function submit(command: ObjectReferenceCommand) {
    if (busy || pending) return;
    const operation = { actorUserId, repositoryId, issueId, command };
    try {
      savePendingObjectReference(sessionStorage, operation);
      setPending(operation);
      void execute(operation);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作尚未送出。");
    }
  }

  const pinned = new Set(loaded?.references.map((reference) => reference.objectId) ?? []);
  const available = objects.filter((object) => !pinned.has(object.objectId));
  const selectedObject = available.find((object) => object.objectId === selected);
  const expectedVersion = loaded?.version ?? issueVersion;

  return (
    <section>
      <h3>Objects</h3>
      {busy && !loaded && <p role="status">讀取 Object references…</p>}
      {error && <p role="alert">{error}</p>}
      {pending && (
        <p>
          上一筆 Object reference 操作結果尚未確認。{" "}
          <button type="button" disabled={busy} onClick={() => void execute(pending)}>
            重試原操作
          </button>
        </p>
      )}
      {loaded && !loaded.references.length && (
        <p className="empty-copy">此 Issue 尚未引用 Object。</p>
      )}
      {loaded?.references.map((reference) => (
        <article key={reference.objectId}>
          <strong>{reference.name}</strong>
          <p>
            {reference.typeName} · 固定 Revision v{reference.pinnedVersion}
            {reference.archived ? " · 已封存" : ""}
          </p>
          {reference.hasNewerRevision && (
            <p>Object 已有較新 Revision v{reference.currentVersion}。</p>
          )}
          {canManage && (
            <>
              {reference.hasNewerRevision && !reference.archived && (
                <button
                  type="button"
                  disabled={busy || Boolean(pending)}
                  onClick={() =>
                    void submit({
                      action: "set-object-reference",
                      requestId: crypto.randomUUID(),
                      repositoryId,
                      issueId,
                      expectedVersion,
                      objectId: reference.objectId,
                      revisionId: reference.currentRevisionId,
                    })
                  }
                >
                  更新至目前 Revision
                </button>
              )}
              <button
                type="button"
                className="secondary"
                disabled={busy || Boolean(pending)}
                onClick={() =>
                  void submit({
                    action: "remove-object-reference",
                    requestId: crypto.randomUUID(),
                    repositoryId,
                    issueId,
                    expectedVersion,
                    objectId: reference.objectId,
                  })
                }
              >
                移除引用
              </button>
            </>
          )}
        </article>
      ))}
      {canManage && available.length > 0 && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedObject) return;
            void submit({
              action: "set-object-reference",
              requestId: crypto.randomUUID(),
              repositoryId,
              issueId,
              expectedVersion,
              objectId: selectedObject.objectId,
              revisionId: selectedObject.revisionId,
            });
          }}
        >
          <label>
            引用目前 Object Revision
            <select value={selected} onChange={(event) => setSelected(event.target.value)}>
              <option value="">選擇 Object</option>
              {available.map((object) => (
                <option key={object.objectId} value={object.objectId}>
                  {object.name} · {object.typeName}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy || Boolean(pending) || !selectedObject}>新增引用</button>
        </form>
      )}
    </section>
  );
}
