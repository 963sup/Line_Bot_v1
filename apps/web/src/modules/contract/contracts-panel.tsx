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
import { Badge } from "../../shared/ui/badge";
import { Button } from "../../shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../shared/ui/card";
import { Input } from "../../shared/ui/input";
import { Label } from "../../shared/ui/label";
import { NativeSelect, NativeSelectOption } from "../../shared/ui/native-select";
import { Textarea } from "../../shared/ui/textarea";

type Summary = {
  contractId: string;
  title: string;
  state: "DRAFT" | "ACTIVE" | "CLOSED";
  version: number;
};
type PlanNode = {
  id: string;
  kind: string;
  title: string;
  plannedQuantity: { measureId: string; value: string } | null;
  measureUnit?: "m" | "pcs";
};
type Line = { lineId: string; planRevisionId: string; nodeId: string; agreedQuantity: string };
type Revision = Summary & {
  body: string;
  lines: Array<{
    lineId: string;
    content: { planRevisionId: string; node: PlanNode };
    agreedQuantity: string;
  }>;
};
type View = {
  actorUserId: string;
  repository: { id: string };
  canEdit: boolean;
  canManage: boolean;
  contracts: Summary[];
  next: string | null;
};
class StaleRequestError extends Error {}
function editableLines(revision: Revision): Line[] {
  return revision.lines.map((line) => ({
    lineId: line.lineId,
    planRevisionId: line.content.planRevisionId,
    nodeId: line.content.node.id,
    agreedQuantity: line.agreedQuantity,
  }));
}
export default function ContractsPanel({
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
  const [selected, setSelected] = useState<Revision | null>(null);
  const [planRevisionId, setPlanRevisionId] = useState("");
  const [nodes, setNodes] = useState<PlanNode[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [nodeId, setNodeId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [pending, setPending] = useState<PendingCommandEnvelope | null>(null);
  const responseGeneration = useRef(0);
  const mutationLock = useRef<symbol | null>(null);
  const draftDirty =
    selected !== null &&
    (selected.title !== title ||
      selected.body !== body ||
      JSON.stringify(editableLines(selected)) !== JSON.stringify(lines));
  const clear = useCallback(() => {
    responseGeneration.current++;
    mutationLock.current = null;
    setView(null);
    setSelected(null);
    setNodes([]);
    setLines([]);
    setPlanRevisionId("");
    setTitle("");
    setBody("");
    setNodeId("");
    setQuantity("");
    setPending(null);
    setError("");
    setBusy(false);
    onCanManageChange(false);
  }, [onCanManageChange]);
  const request = useCallback(
    async (
      endpoint: "contracts" | "content",
      query: Record<string, string> = {},
      command?: object,
    ) => {
      const ticket = responseGeneration.current;
      try {
        const generation = await liffClient.ensureSession(liffId);
        if (ticket !== responseGeneration.current) throw new StaleRequestError();
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
        if (ticket !== responseGeneration.current) throw new StaleRequestError();
        if (!response.ok)
          throw Object.assign(new Error(value.error ?? "Contracts 載入失敗。"), {
            status: response.status,
            code: value.code,
          });
        return value;
      } catch (error) {
        if (ticket !== responseGeneration.current) throw new StaleRequestError();
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
      const revisionId = new URLSearchParams(globalThis.window.location.search).get(
        "planRevisionId",
      );
      const contentQuery = revisionId === null ? {} : { revisionId };
      const [contracts, content] = await Promise.all([
        request("contracts"),
        request("content", contentQuery),
      ]);
      setView(contracts);
      setPending(
        restorePendingCommand(
          sessionStorage,
          "contracts",
          contracts.actorUserId,
          contracts.repository.id,
        ),
      );
      onCanManageChange(contracts.canManage);
      if (content.revision) {
        setPlanRevisionId(content.revision.revisionId);
        const measures = new Map(
          content.revision.document.measures.map((measure: { id: string; unit: "m" | "pcs" }) => [
            measure.id,
            measure.unit,
          ]),
        );
        setNodes(
          content.revision.document.nodes
            .filter(
              (node: PlanNode) =>
                (node.kind === "WORK" || node.kind === "TASK") && node.plannedQuantity !== null,
            )
            .map((node: PlanNode) => {
              const measureUnit = node.plannedQuantity
                ? measures.get(node.plannedQuantity.measureId)
                : undefined;
              return { ...node, ...(measureUnit ? { measureUnit } : {}) };
            }),
        );
      }
    } catch (cause) {
      if (cause instanceof StaleRequestError) return;
      setError(cause instanceof Error ? cause.message : "Contracts 載入失敗。");
    } finally {
      if (operationGeneration === responseGeneration.current) setBusy(false);
    }
  }, [onCanManageChange, request]);
  const visibility = useEffectEvent(() => {
    clear();
    if (document.visibilityState === "visible") void load();
  });
  useEffect(() => {
    const unsubscribe = liffClient.onSessionBlocked(clear);
    const onVisibility = () => visibility();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", clear);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", clear);
    };
  }, [clear]);
  const open = async (contractId: string) => {
    const operationGeneration = responseGeneration.current;
    setBusy(true);
    try {
      const value = await request("contracts", { contractId });
      const revision: Revision = value.revision;
      setSelected(revision);
      setTitle(revision.title);
      setBody(revision.body);
      setLines(editableLines(revision));
    } catch (cause) {
      if (cause instanceof StaleRequestError) return;
      setError(cause instanceof Error ? cause.message : "Contract 載入失敗。");
    } finally {
      if (operationGeneration === responseGeneration.current) setBusy(false);
    }
  };
  const loadMore = async () => {
    if (!view?.next) return;
    const operationGeneration = responseGeneration.current;
    setBusy(true);
    try {
      const next: View = await request("contracts", { after: view.next });
      setView((current) =>
        current
          ? {
              ...current,
              contracts: [
                ...current.contracts,
                ...next.contracts.filter(
                  (item) =>
                    !current.contracts.some((existing) => existing.contractId === item.contractId),
                ),
              ],
              next: next.next,
            }
          : next,
      );
    } catch (cause) {
      if (cause instanceof StaleRequestError) return;
      setError(cause instanceof Error ? cause.message : "Contracts 下一頁載入失敗。");
    } finally {
      if (operationGeneration === responseGeneration.current) setBusy(false);
    }
  };
  const executeCommand = async (
    saved: PendingCommandEnvelope,
    retry = false,
    existingToken?: symbol,
  ) => {
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
      const result = await request("contracts", {}, saved.command);
      if (!confirmsPendingReceipt(result, saved))
        throw new Error("操作結果尚未確認；請沿用原命令重試。");
      if (!removePendingCommand(sessionStorage, saved)) return;
      setPending((current) => (samePendingCommand(current, saved) ? null : current));
      setSelected(result.revision);
      setTitle(result.revision.title);
      setBody(result.revision.body);
      setLines(editableLines(result.revision));
      await load();
    } catch (cause) {
      if (cause instanceof StaleRequestError) return;
      if (!shouldRetainPendingCommand(cause, retry)) {
        const removed = removePendingCommand(sessionStorage, saved);
        if (removed) setPending((current) => (samePendingCommand(current, saved) ? null : current));
      }
      setError(cause instanceof Error ? cause.message : "Contract 操作結果不明，請先重新讀取。");
    } finally {
      if (operationGeneration === responseGeneration.current) setBusy(false);
      releasePendingCommandLock(mutationLock, token);
    }
  };
  const execute = async (action: "create" | "edit" | "activate" | "close") => {
    if (!view || pending) return;
    const token = acquirePendingCommandLock(mutationLock);
    if (!token) return;
    try {
      const saved = persistPendingCommand(
        sessionStorage,
        "contracts",
        view.actorUserId,
        view.repository.id,
        {
          action,
          repositoryId: view.repository.id,
          contractId: selected?.contractId ?? crypto.randomUUID(),
          requestId: crypto.randomUUID(),
          expectedVersion: selected?.version ?? 0,
          ...(action === "create" || action === "edit" ? { title, body, lines } : {}),
        },
      );
      setPending(saved);
      await executeCommand(saved, false, token);
    } catch (cause) {
      releasePendingCommandLock(mutationLock, token);
      setError(cause instanceof Error ? cause.message : "無法安全保存操作，未送出請求。");
    }
  };
  return (
    <div className="grid gap-4 p-4 md:grid-cols-[minmax(16rem,1fr)_2fr]">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      <Card>
        <CardHeader>
          <CardTitle>工作承諾</CardTitle>
          <CardDescription>以 Content 的 Work／Task 版本建立合約。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {view?.contracts.length
            ? view.contracts.map((contract) => (
                <Button
                  key={contract.contractId}
                  variant="outline"
                  className="justify-between"
                  onClick={() => void open(contract.contractId)}
                >
                  <span>{contract.title}</span>
                  <Badge variant="secondary">{contract.state}</Badge>
                </Button>
              ))
            : !busy && <p className="text-sm text-muted-foreground">目前沒有 Contract。</p>}
          {view?.next && (
            <Button variant="outline" disabled={busy} onClick={() => void loadMore()}>
              載入更多 Contracts
            </Button>
          )}
          <Button
            variant="outline"
            disabled={!view?.canEdit}
            onClick={() => {
              setSelected(null);
              setTitle("");
              setBody("");
              setLines([]);
            }}
          >
            新增 Contract
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{selected ? selected.title : "新增 Contract"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {pending && (
            <div className="flex flex-wrap gap-2 text-sm">
              <span>上次操作結果不明；保留相同 command/requestId。</span>
              <Button size="sm" disabled={busy} onClick={() => void executeCommand(pending, true)}>
                原命令重試
              </Button>
            </div>
          )}
          <Label>標題</Label>
          <Input
            value={title}
            disabled={
              !view?.canEdit || (selected?.state !== undefined && selected.state !== "DRAFT")
            }
            onChange={(event) => setTitle(event.target.value)}
          />
          <Label>內容</Label>
          <Textarea
            value={body}
            disabled={
              !view?.canEdit || (selected?.state !== undefined && selected.state !== "DRAFT")
            }
            onChange={(event) => setBody(event.target.value)}
          />
          <Label>Work / Task</Label>
          <div className="flex flex-wrap gap-2">
            <NativeSelect
              value={nodeId}
              disabled={
                !view?.canEdit || (selected?.state !== undefined && selected.state !== "DRAFT")
              }
              onChange={(event) => setNodeId(event.target.value)}
            >
              <NativeSelectOption value="">選擇節點</NativeSelectOption>
              {nodes.map((node) => (
                <NativeSelectOption key={node.id} value={node.id}>
                  {node.kind}: {node.title} · {node.plannedQuantity?.value} {node.measureUnit}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Input
              className="max-w-40"
              placeholder="約定數量"
              value={quantity}
              disabled={
                !view?.canEdit || (selected?.state !== undefined && selected.state !== "DRAFT")
              }
              onChange={(event) => setQuantity(event.target.value)}
            />
            <Button
              variant="outline"
              disabled={
                !view?.canEdit ||
                (selected?.state !== undefined && selected.state !== "DRAFT") ||
                !nodeId ||
                !quantity ||
                !planRevisionId
              }
              onClick={() => {
                setLines((current) => [
                  ...current,
                  { lineId: crypto.randomUUID(), planRevisionId, nodeId, agreedQuantity: quantity },
                ]);
                setQuantity("");
              }}
            >
              加入
            </Button>
          </div>
          {lines.map((line) => (
            <div
              key={line.lineId}
              className="flex items-center justify-between rounded-lg border p-2 text-sm"
            >
              <span>
                {nodes.find((node) => node.id === line.nodeId)?.title ?? line.nodeId} ·{" "}
                {line.agreedQuantity}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  !view?.canEdit || (selected?.state !== undefined && selected.state !== "DRAFT")
                }
                onClick={() =>
                  setLines((current) => current.filter((item) => item.lineId !== line.lineId))
                }
              >
                移除
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                !view?.canEdit ||
                busy ||
                pending !== null ||
                !title.trim() ||
                lines.length === 0 ||
                selected?.state === "ACTIVE" ||
                selected?.state === "CLOSED"
              }
              onClick={() => void execute(selected ? "edit" : "create")}
            >
              {selected ? "儲存草稿" : "建立草稿"}
            </Button>
            {selected?.state === "DRAFT" && (
              <Button
                variant="outline"
                disabled={!view?.canManage || busy || pending !== null || draftDirty}
                onClick={() => void execute("activate")}
              >
                啟用
              </Button>
            )}
            {selected?.state === "ACTIVE" && (
              <Button
                variant="outline"
                disabled={!view?.canManage || busy || pending !== null}
                onClick={() => void execute("close")}
              >
                結案
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
