"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import {
  acquirePendingCommandLock,
  confirmsPendingReceipt,
  type PendingCommandEnvelope,
  persistPendingCommand,
  releasePendingCommandLock,
  removePendingCommand,
  restorePendingCommand,
  samePendingCommand,
  shouldRetainPendingCommand,
} from "../../shared/browser/pending-command";
import { Button } from "../../shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../shared/ui/card";
import { Input } from "../../shared/ui/input";
import { Label } from "../../shared/ui/label";
import { NativeSelect, NativeSelectOption } from "../../shared/ui/native-select";
import { Textarea } from "../../shared/ui/textarea";

type Kind = "SUBJECT" | "OBJECT" | "SUBOBJECT" | "WORK" | "TASK";
type Measure = { id: string; name: string; subject: string; unit: string };
type ResourcePin = {
  nodeId: string;
  resourceId: string;
  resourceRevisionId: string;
  kind: "LOCATION" | "EQUIPMENT" | "MATERIAL";
};
type Resource = {
  resourceId: string;
  revisionId: string;
  name: string;
  kind: ResourcePin["kind"];
  state: string;
};
type Node = {
  id: string;
  parentId: string | null;
  position: number;
  kind: Kind;
  title: string;
  body: string;
  plannedQuantity: { measureId: string; value: string } | null;
};
type Revision = {
  revisionId: string;
  version: number;
  document: {
    schemaVersion: 1;
    measures: Measure[];
    nodes: Node[];
    resourcePins: ResourcePin[];
  };
};
type View = {
  actorUserId: string;
  repository: { id: string };
  canEdit: boolean;
  canManage: boolean;
  revision: Revision | null;
};
const kinds: Kind[] = ["SUBJECT", "OBJECT", "SUBOBJECT", "WORK", "TASK"];
const parentKind: Record<Exclude<Kind, "SUBJECT">, Kind> = {
  OBJECT: "SUBJECT",
  SUBOBJECT: "OBJECT",
  WORK: "SUBOBJECT",
  TASK: "WORK",
};
type Document = Revision["document"];
const emptyDocument = (): Document => ({
  schemaVersion: 1,
  measures: [],
  nodes: [],
  resourcePins: [],
});
export class StaleRequestError extends Error {}
export function assertCurrentRequest(ticket: number, current: number) {
  if (ticket !== current) throw new StaleRequestError();
}
export function eligibleParentNodes(nodes: Node[], kind: Kind) {
  return kind === "SUBJECT" ? [] : nodes.filter((node) => node.kind === parentKind[kind]);
}

export default function ContentPanel({
  liffId,
  ownerLogin,
  repositoryName,
  onCanManageChange,
}: {
  liffId: string;
  ownerLogin: string;
  repositoryName: string;
  onCanManageChange(value: boolean): void;
}) {
  const [view, setView] = useState<View | null>(null);
  const [document, setDocument] = useState(emptyDocument());
  const [kind, setKind] = useState<Kind>("SUBJECT");
  const [parentId, setParentId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourceNext, setResourceNext] = useState<string | null>(null);
  const [measureName, setMeasureName] = useState("");
  const [measureSubject, setMeasureSubject] = useState("");
  const [measureUnit, setMeasureUnit] = useState<Measure["unit"]>("pcs");
  const [pinNodeId, setPinNodeId] = useState("");
  const [pinResourceId, setPinResourceId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [pending, setPending] = useState<PendingCommandEnvelope | null>(null);
  const responseGeneration = useRef(0);
  const mutationLock = useRef<symbol | null>(null);
  const clear = useCallback(() => {
    responseGeneration.current++;
    mutationLock.current = null;
    setView(null);
    setDocument(emptyDocument());
    setResources([]);
    setResourceNext(null);
    setKind("SUBJECT");
    setParentId("");
    setTitle("");
    setBody("");
    setMeasureName("");
    setMeasureSubject("");
    setMeasureUnit("pcs");
    setPinNodeId("");
    setPinResourceId("");
    setPending(null);
    setError("");
    setBusy(false);
    onCanManageChange(false);
  }, [onCanManageChange]);
  const request = useCallback(
    async (
      endpoint: "content" | "resources" = "content",
      command?: object,
      query: Record<string, string> = {},
    ) => {
      const ticket = responseGeneration.current;
      try {
        const generation = await liffClient.ensureSession(liffId);
        assertCurrentRequest(ticket, responseGeneration.current);
        if (!generation) throw new Error("請完成 LINE 登入。");
        const search = new URLSearchParams({ owner: ownerLogin, name: repositoryName, ...query });
        const response = await fetch(`/api/repository-${endpoint}?${search}`, {
          method: command ? "POST" : "GET",
          cache: "no-store",
          headers: {
            "X-App-Session-Generation": generation,
            ...(command ? { "Content-Type": "application/json" } : {}),
          },
          ...(command ? { body: JSON.stringify(command) } : {}),
        });
        const value = await response.json();
        assertCurrentRequest(ticket, responseGeneration.current);
        if (!response.ok)
          throw Object.assign(new Error(value.error ?? "Content 載入失敗。"), {
            status: response.status,
            code: value.code,
          });
        return value;
      } catch (error) {
        assertCurrentRequest(ticket, responseGeneration.current);
        throw error;
      }
    },
    [liffId, ownerLogin, repositoryName],
  );
  const load = useCallback(async () => {
    const operationGeneration = responseGeneration.current;
    setBusy(true);
    setError("");
    try {
      const [next, resourceView]: [View, { resources: Resource[]; next: string | null }] =
        await Promise.all([request(), request("resources")]);
      setView(next);
      setResources(resourceView.resources);
      setResourceNext(resourceView.next);
      setDocument(next.revision?.document ?? emptyDocument());
      setPending(
        restorePendingCommand(sessionStorage, "content", next.actorUserId, next.repository.id),
      );
      onCanManageChange(next.canManage);
    } catch (cause) {
      if (cause instanceof StaleRequestError) return;
      setError(cause instanceof Error ? cause.message : "Content 載入失敗。");
    } finally {
      if (operationGeneration === responseGeneration.current) setBusy(false);
    }
  }, [onCanManageChange, request]);
  const visibility = useEffectEvent(() => {
    clear();
    if (globalThis.document.visibilityState === "visible") void load();
  });
  useEffect(() => {
    const unsubscribe = liffClient.onSessionBlocked(clear);
    const onVisibility = () => visibility();
    globalThis.document.addEventListener("visibilitychange", onVisibility);
    globalThis.window.addEventListener("pagehide", clear);
    return () => {
      unsubscribe();
      globalThis.document.removeEventListener("visibilitychange", onVisibility);
      globalThis.window.removeEventListener("pagehide", clear);
    };
  }, [clear]);
  const addNode = () => {
    const selectedParent = document.nodes.find((node) => node.id === parentId);
    if (
      !title.trim() ||
      (kind === "SUBJECT" ? parentId !== "" : selectedParent?.kind !== parentKind[kind])
    )
      return;
    setDocument((current) => ({
      ...current,
      nodes: [
        ...current.nodes,
        {
          id: crypto.randomUUID(),
          parentId: parentId || null,
          position: current.nodes.filter((node) => node.parentId === (parentId || null)).length,
          kind,
          title,
          body,
          plannedQuantity: null,
        },
      ],
    }));
    setTitle("");
    setBody("");
  };
  const loadMoreResources = async () => {
    if (!resourceNext) return;
    const operationGeneration = responseGeneration.current;
    setBusy(true);
    try {
      const value = await request("resources", undefined, { after: resourceNext });
      setResources((current) => [
        ...current,
        ...value.resources.filter(
          (item: Resource) => !current.some((existing) => existing.resourceId === item.resourceId),
        ),
      ]);
      setResourceNext(value.next);
    } catch (cause) {
      if (cause instanceof StaleRequestError) return;
      setError(cause instanceof Error ? cause.message : "Resources 下一頁載入失敗。");
    } finally {
      if (operationGeneration === responseGeneration.current) setBusy(false);
    }
  };
  const commit = async (saved: PendingCommandEnvelope, retry = false, existingToken?: symbol) => {
    const token = existingToken ?? acquirePendingCommandLock(mutationLock);
    if (!token || mutationLock.current !== token) return;
    if (!view) {
      releasePendingCommandLock(mutationLock, token);
      return;
    }
    const operationGeneration = responseGeneration.current;
    setBusy(true);
    setError("");
    try {
      const result = await request("content", saved.command);
      if (!confirmsPendingReceipt(result, saved))
        throw new Error("操作結果尚未確認；請沿用原命令重試。");
      if (!removePendingCommand(sessionStorage, saved)) return;
      setPending((current) => (samePendingCommand(current, saved) ? null : current));
      const next = { ...view, revision: result.revision };
      setView(next);
      setDocument(result.revision.document);
    } catch (cause) {
      if (cause instanceof StaleRequestError) return;
      if (!shouldRetainPendingCommand(cause, retry)) {
        const removed = removePendingCommand(sessionStorage, saved);
        if (removed) setPending((current) => (samePendingCommand(current, saved) ? null : current));
      }
      setError(cause instanceof Error ? cause.message : "Content 儲存結果不明，請先重新讀取。");
    } finally {
      if (operationGeneration === responseGeneration.current) setBusy(false);
      releasePendingCommandLock(mutationLock, token);
    }
  };
  const submit = async (command: object) => {
    if (!view || pending) throw new Error("Complete the current Content command first.");
    const token = acquirePendingCommandLock(mutationLock);
    if (!token) throw new Error("A Content command is already running.");
    try {
      const saved = persistPendingCommand(
        sessionStorage,
        "content",
        view.actorUserId,
        view.repository.id,
        command,
      );
      setPending(saved);
      await commit(saved, false, token);
    } catch (cause) {
      releasePendingCommandLock(mutationLock, token);
      throw cause;
    }
  };
  const save = async () => {
    if (!view || pending) return;
    try {
      await submit({
        action: view.revision ? "replace" : "initialize",
        repositoryId: view.repository.id,
        requestId: crypto.randomUUID(),
        expectedVersion: view.revision?.version ?? 0,
        document,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法安全保存操作，未送出請求。");
    }
  };
  return (
    <div className="grid gap-4 p-4">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {pending && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
          <span>上次儲存結果不明；保留相同 command/requestId。</span>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void commit(pending, true)}
          >
            原命令重試
          </Button>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>工作階層</CardTitle>
          <CardDescription>
            Subject → Object → SubObject → Work → Task；每次儲存完整版本。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {document.nodes.length === 0 && !busy ? (
            <p className="text-sm text-muted-foreground">尚未初始化，可新增第一個 Subject。</p>
          ) : (
            document.nodes.map((node) => (
              <div key={node.id} className="grid gap-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <strong>
                    {node.kind}: {node.title}
                  </strong>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!view?.canEdit}
                    onClick={() =>
                      setDocument((current) => {
                        const removed = new Set([node.id]);
                        for (let changed = true; changed; ) {
                          changed = false;
                          for (const item of current.nodes) {
                            if (
                              item.parentId &&
                              removed.has(item.parentId) &&
                              !removed.has(item.id)
                            ) {
                              removed.add(item.id);
                              changed = true;
                            }
                          }
                        }
                        return {
                          ...current,
                          nodes: current.nodes.filter((item) => !removed.has(item.id)),
                          resourcePins: current.resourcePins.filter(
                            (pin) => !removed.has(pin.nodeId),
                          ),
                        };
                      })
                    }
                  >
                    移除
                  </Button>
                </div>
                <Input
                  value={node.title}
                  aria-label="節點標題"
                  disabled={!view?.canEdit}
                  onChange={(event) =>
                    setDocument((current) => ({
                      ...current,
                      nodes: current.nodes.map((item) =>
                        item.id === node.id ? { ...item, title: event.target.value } : item,
                      ),
                    }))
                  }
                />
                <Textarea
                  value={node.body}
                  aria-label="節點內容"
                  disabled={!view?.canEdit}
                  onChange={(event) =>
                    setDocument((current) => ({
                      ...current,
                      nodes: current.nodes.map((item) =>
                        item.id === node.id ? { ...item, body: event.target.value } : item,
                      ),
                    }))
                  }
                />
                {(node.kind === "WORK" || node.kind === "TASK") && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <NativeSelect
                      aria-label="計量基準"
                      value={node.plannedQuantity?.measureId ?? ""}
                      disabled={!view?.canEdit}
                      onChange={(event) =>
                        setDocument((current) => ({
                          ...current,
                          nodes: current.nodes.map((item) =>
                            item.id === node.id
                              ? {
                                  ...item,
                                  plannedQuantity: event.target.value
                                    ? {
                                        measureId: event.target.value,
                                        value: item.plannedQuantity?.value ?? "",
                                      }
                                    : null,
                                }
                              : item,
                          ),
                        }))
                      }
                    >
                      <NativeSelectOption value="">無計畫數量</NativeSelectOption>
                      {document.measures.map((measure) => (
                        <NativeSelectOption key={measure.id} value={measure.id}>
                          {measure.name} ({measure.unit})
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <Input
                      aria-label="計畫數量"
                      value={node.plannedQuantity?.value ?? ""}
                      disabled={!view?.canEdit || !node.plannedQuantity}
                      onChange={(event) =>
                        setDocument((current) => ({
                          ...current,
                          nodes: current.nodes.map((item) =>
                            item.id === node.id && item.plannedQuantity
                              ? {
                                  ...item,
                                  plannedQuantity: {
                                    ...item.plannedQuantity,
                                    value: event.target.value,
                                  },
                                }
                              : item,
                          ),
                        }))
                      }
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>計量基準與 Resources</CardTitle>
          <CardDescription>
            Work／Task 的計畫數量使用版本內固定的 measure；單位可自行輸入（pcs
            為整數，其餘至多三位小數），不自動換算。Resource pin 固定到目前 revision。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <Input
              aria-label="計量名稱"
              placeholder="計量名稱"
              value={measureName}
              onChange={(event) => setMeasureName(event.target.value)}
            />
            <Input
              aria-label="計量主題"
              placeholder="計量主題"
              value={measureSubject}
              onChange={(event) => setMeasureSubject(event.target.value)}
            />
            <Input
              aria-label="計量單位"
              placeholder="單位，例如 pcs、m、SET、組"
              value={measureUnit}
              maxLength={32}
              onChange={(event) => setMeasureUnit(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={
                !view?.canEdit ||
                !measureName.trim() ||
                !measureSubject.trim() ||
                !measureUnit.trim()
              }
              onClick={() => {
                setDocument((current) => ({
                  ...current,
                  measures: [
                    ...current.measures,
                    {
                      id: crypto.randomUUID(),
                      name: measureName,
                      subject: measureSubject,
                      unit: measureUnit.trim(),
                    },
                  ],
                }));
                setMeasureName("");
                setMeasureSubject("");
              }}
            >
              新增 measure
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <NativeSelect value={pinNodeId} onChange={(event) => setPinNodeId(event.target.value)}>
              <NativeSelectOption value="">選擇節點</NativeSelectOption>
              {document.nodes.map((node) => (
                <NativeSelectOption key={node.id} value={node.id}>
                  {node.title}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect
              value={pinResourceId}
              onChange={(event) => setPinResourceId(event.target.value)}
            >
              <NativeSelectOption value="">選擇 Resource</NativeSelectOption>
              {resources
                .filter((resource) => resource.state === "ACTIVE")
                .map((resource) => (
                  <NativeSelectOption key={resource.resourceId} value={resource.resourceId}>
                    {resource.kind}: {resource.name}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
            <Button
              type="button"
              variant="outline"
              disabled={!view?.canEdit || !pinNodeId || !pinResourceId}
              onClick={() => {
                const resource = resources.find((item) => item.resourceId === pinResourceId);
                if (!resource) return;
                setDocument((current) => ({
                  ...current,
                  resourcePins: [
                    ...current.resourcePins.filter(
                      (pin) =>
                        !(pin.nodeId === pinNodeId && pin.resourceId === resource.resourceId),
                    ),
                    {
                      nodeId: pinNodeId,
                      resourceId: resource.resourceId,
                      resourceRevisionId: resource.revisionId,
                      kind: resource.kind,
                    },
                  ],
                }));
              }}
            >
              固定 Resource
            </Button>
          </div>
          {resourceNext && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void loadMoreResources()}
            >
              載入更多 Resources
            </Button>
          )}
          {document.resourcePins.map((pin) => (
            <div
              key={`${pin.nodeId}:${pin.resourceId}`}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span>
                {document.nodes.find((node) => node.id === pin.nodeId)?.title ?? pin.nodeId} ·{" "}
                {pin.kind}:{" "}
                {resources.find((resource) => resource.resourceId === pin.resourceId)?.name ??
                  pin.resourceId}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!view?.canEdit}
                onClick={() =>
                  setDocument((current) => ({
                    ...current,
                    resourcePins: current.resourcePins.filter((item) => item !== pin),
                  }))
                }
              >
                移除
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>新增節點</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Label>類型</Label>
          <NativeSelect
            value={kind}
            onChange={(event) => {
              const next = kinds.find((value) => value === event.target.value);
              if (next) {
                setKind(next);
                setParentId("");
              }
            }}
          >
            {kinds.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {value}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Label>上層</Label>
          <NativeSelect
            value={parentId}
            disabled={kind === "SUBJECT"}
            onChange={(event) => setParentId(event.target.value)}
          >
            <NativeSelectOption value="">
              {kind === "SUBJECT" ? "根節點" : "選擇上層"}
            </NativeSelectOption>
            {eligibleParentNodes(document.nodes, kind).map((node) => (
              <NativeSelectOption key={node.id} value={node.id}>
                {node.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Label>標題</Label>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          <Label>內容</Label>
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={
                !view?.canEdit || busy || !title.trim() || (kind !== "SUBJECT" && !parentId)
              }
              onClick={addNode}
            >
              加入
            </Button>
            <Button
              type="button"
              disabled={!view?.canEdit || busy || pending !== null || document.nodes.length === 0}
              onClick={() => void save()}
            >
              儲存版本
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
