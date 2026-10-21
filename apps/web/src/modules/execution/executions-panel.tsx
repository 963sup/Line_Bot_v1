"use client";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import {
  acquirePendingCommandLock,
  confirmsPendingReceipt,
  type PendingCommand,
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

type ContractState = "DRAFT" | "ACTIVE" | "CLOSED";
type ContractSummary = { contractId: string; title: string; state: ContractState };
type FrozenMeasure = { id: string; name: string; subject: string; unit: "m" | "pcs" };
type FrozenContentBasis = {
  planRevisionId: string;
  node: {
    id: string;
    kind: "WORK" | "TASK";
    title: string;
    body: string;
    path: Array<{ id: string; kind: string; title: string }>;
    plannedQuantity: { value: string; measure: FrozenMeasure } | null;
  };
};
type FrozenResourceQuantityBasis = {
  name: string;
  sourceQuantity: string;
  measure: FrozenMeasure;
};
type ContractLine = {
  lineId: string;
  agreedQuantity: string;
  content?: FrozenContentBasis;
  resource?: FrozenResourceQuantityBasis;
};
type ContractRevision = {
  contractId: string;
  revisionId: string;
  title: string;
  state: ContractState;
  lines: ContractLine[];
};
type Task = {
  id: string;
  parentId: string | null;
  title: string;
  kind: string;
  plannedQuantity: { measureId: string; value: string } | null;
  measureUnit?: "m" | "pcs";
};
type ContentDocument = {
  nodes: Task[];
  measures: Array<{ id: string; unit: "m" | "pcs" }>;
};
type Resource = {
  resourceId: string;
  revisionId: string;
  name: string;
  kind: string;
  state: string;
};
type ExecutionSummary = {
  executionId: string;
  lineId: string;
  state: string;
  quantity: string;
  version: number;
};
type ExecutionRevision = ExecutionSummary & {
  note: string;
  reason: string | null;
  basis: ContractLine;
  task?: FrozenContentBasis;
  resources?: Array<{ resourceId: string; name: string; kind: string }>;
  dependency?: {
    version: number;
    revisionId: string | null;
    prerequisiteTaskIds: string[];
  };
};
type Scope = {
  actorUserId: string;
  repository: { id: string };
  canEdit: boolean;
  canManage: boolean;
};
type DependencyEdge = { taskId: string; prerequisiteTaskId: string };
class StaleRequestError extends Error {}
export function isCurrentIntent(expected: number, current: number) {
  return expected === current;
}
function executionSubmissionAllowed(state: ContractState | undefined) {
  return state === "ACTIVE";
}
export function eligibleTasks(document: ContentDocument, line: ContractLine | undefined) {
  if (!line?.content) return [];
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const measureUnits = new Map(document.measures.map((measure) => [measure.id, measure.unit]));
  return document.nodes
    .filter((node) => {
      if (node.kind !== "TASK" || node.plannedQuantity === null) return false;
      if (line.content?.node.kind === "TASK") return node.id === line.content.node.id;
      for (let current: Task | undefined = node; current?.parentId; ) {
        if (current.parentId === line.content?.node.id) return true;
        current = byId.get(current.parentId);
      }
      return false;
    })
    .map((node) => {
      const measureUnit = node.plannedQuantity
        ? measureUnits.get(node.plannedQuantity.measureId)
        : undefined;
      return { ...node, ...(measureUnit ? { measureUnit } : {}) };
    });
}
export function planTasks(document: ContentDocument) {
  const measureUnits = new Map(document.measures.map((measure) => [measure.id, measure.unit]));
  return document.nodes
    .filter((node) => node.kind === "TASK")
    .map((node) => {
      const measureUnit = node.plannedQuantity
        ? measureUnits.get(node.plannedQuantity.measureId)
        : undefined;
      return { ...node, ...(measureUnit ? { measureUnit } : {}) };
    });
}
export default function ExecutionsPanel({
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
  const [scope, setScope] = useState<Scope | null>(null);
  const [contracts, setContracts] = useState<ContractSummary[]>([]);
  const [contractNext, setContractNext] = useState<string | null>(null);
  const [contract, setContract] = useState<ContractRevision | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dependencyTasks, setDependencyTasks] = useState<Task[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourceNext, setResourceNext] = useState<string | null>(null);
  const [executions, setExecutions] = useState<ExecutionSummary[]>([]);
  const [executionNext, setExecutionNext] = useState<string | null>(null);
  const [selected, setSelected] = useState<ExecutionRevision | null>(null);
  const [lineId, setLineId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [resourceIds, setResourceIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [dependencyVersion, setDependencyVersion] = useState(0);
  const [dependencyEdges, setDependencyEdges] = useState<DependencyEdge[]>([]);
  const [dependencyTaskId, setDependencyTaskId] = useState("");
  const [prerequisiteTaskId, setPrerequisiteTaskId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [pending, setPending] = useState<PendingCommandEnvelope | null>(null);
  const responseGeneration = useRef(0);
  const selectionIntent = useRef(0);
  const mutationLock = useRef<symbol | null>(null);
  const clear = useCallback(() => {
    responseGeneration.current++;
    selectionIntent.current++;
    mutationLock.current = null;
    setScope(null);
    setContracts([]);
    setContractNext(null);
    setContract(null);
    setTasks([]);
    setDependencyTasks([]);
    setResources([]);
    setResourceNext(null);
    setExecutions([]);
    setExecutionNext(null);
    setSelected(null);
    setLineId("");
    setTaskId("");
    setResourceIds([]);
    setQuantity("");
    setNote("");
    setReason("");
    setDependencyEdges([]);
    setDependencyVersion(0);
    setDependencyTaskId("");
    setPrerequisiteTaskId("");
    setPending(null);
    setError("");
    setBusy(false);
    onCanManageChange(false);
  }, [onCanManageChange]);
  const request = useCallback(
    async (
      endpoint: "contracts" | "content" | "resources" | "executions",
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
          throw Object.assign(new Error(value.error ?? "Executions 載入失敗。"), {
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
      const [contractView, resourceView] = await Promise.all([
        request("contracts"),
        request("resources"),
      ]);
      setScope(contractView);
      setPending(
        restorePendingCommand(
          sessionStorage,
          "executions",
          contractView.actorUserId,
          contractView.repository.id,
        ),
      );
      setContracts(contractView.contracts);
      setContractNext(contractView.next);
      setTasks([]);
      setDependencyTasks([]);
      setResources(resourceView.resources);
      setResourceNext(resourceView.next);
      onCanManageChange(contractView.canManage);
    } catch (cause) {
      if (cause instanceof StaleRequestError) return;
      setError(cause instanceof Error ? cause.message : "Executions 載入失敗。");
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
  const openContract = async (contractId: string) => {
    if (pending) return;
    const intent = ++selectionIntent.current;
    const operationGeneration = responseGeneration.current;
    setBusy(true);
    try {
      const [contractView, executionView] = await Promise.all([
        request("contracts", { contractId }),
        request("executions", { contractId }),
      ]);
      if (!isCurrentIntent(intent, selectionIntent.current)) return;
      const revision: ContractRevision = contractView.revision;
      setLineId("");
      setTaskId("");
      setResourceIds([]);
      setQuantity("");
      setNote("");
      setReason("");
      setDependencyVersion(0);
      setDependencyEdges([]);
      setTasks([]);
      setContract(revision);
      setExecutions(executionView.executions);
      setExecutionNext(executionView.next);
      setSelected(null);
    } catch (cause) {
      if (cause instanceof StaleRequestError || !isCurrentIntent(intent, selectionIntent.current))
        return;
      setError(cause instanceof Error ? cause.message : "Contract 執行資料載入失敗。");
    } finally {
      if (
        isCurrentIntent(intent, selectionIntent.current) &&
        operationGeneration === responseGeneration.current
      )
        setBusy(false);
    }
  };
  const openExecution = async (executionId: string) => {
    if (pending) return;
    const intent = ++selectionIntent.current;
    const operationGeneration = responseGeneration.current;
    setBusy(true);
    try {
      const value = await request("executions", { executionId });
      if (
        !isCurrentIntent(intent, selectionIntent.current) ||
        value.revision.executionId !== executionId
      )
        return;
      setSelected(value.revision);
      setNote(value.revision.note);
    } catch (cause) {
      if (cause instanceof StaleRequestError || !isCurrentIntent(intent, selectionIntent.current))
        return;
      setError(cause instanceof Error ? cause.message : "Execution 載入失敗。");
    } finally {
      if (
        isCurrentIntent(intent, selectionIntent.current) &&
        operationGeneration === responseGeneration.current
      )
        setBusy(false);
    }
  };
  const loadMore = async (kind: "contracts" | "resources" | "executions") => {
    const after =
      kind === "contracts" ? contractNext : kind === "resources" ? resourceNext : executionNext;
    if (!after || (kind === "executions" && !contract)) return;
    const operationGeneration = responseGeneration.current;
    setBusy(true);
    try {
      const value = await request(kind, {
        after,
        ...(kind === "executions" && contract ? { contractId: contract.contractId } : {}),
      });
      if (kind === "contracts") {
        setContracts((current) => [
          ...current,
          ...value.contracts.filter(
            (item: ContractSummary) =>
              !current.some((existing) => existing.contractId === item.contractId),
          ),
        ]);
        setContractNext(value.next);
      } else if (kind === "resources") {
        setResources((current) => [
          ...current,
          ...value.resources.filter(
            (item: Resource) =>
              !current.some((existing) => existing.resourceId === item.resourceId),
          ),
        ]);
        setResourceNext(value.next);
      } else {
        setExecutions((current) => [
          ...current,
          ...value.executions.filter(
            (item: ExecutionSummary) =>
              !current.some((existing) => existing.executionId === item.executionId),
          ),
        ]);
        setExecutionNext(value.next);
      }
    } catch (cause) {
      if (cause instanceof StaleRequestError) return;
      setError(cause instanceof Error ? cause.message : "下一頁載入失敗。");
    } finally {
      if (operationGeneration === responseGeneration.current) setBusy(false);
    }
  };
  const chooseLine = async (nextLineId: string) => {
    if (pending) return;
    const intent = ++selectionIntent.current;
    setLineId(nextLineId);
    setTaskId("");
    const planRevisionId = contract?.lines.find((line) => line.lineId === nextLineId)?.content
      ?.planRevisionId;
    if (!planRevisionId) return;
    try {
      const [contentView, dependencyView] = await Promise.all([
        request("content", { revisionId: planRevisionId }),
        request("executions", { view: "dependencies", planRevisionId }),
      ]);
      if (!isCurrentIntent(intent, selectionIntent.current) || contract?.contractId === undefined)
        return;
      setTasks(
        eligibleTasks(
          contentView.revision.document,
          contract?.lines.find((line) => line.lineId === nextLineId),
        ),
      );
      setDependencyTasks(planTasks(contentView.revision.document));
      setDependencyVersion(dependencyView.dependencies.version);
      setDependencyEdges(dependencyView.dependencies.edges);
    } catch (cause) {
      if (cause instanceof StaleRequestError || !isCurrentIntent(intent, selectionIntent.current))
        return;
      setError(cause instanceof Error ? cause.message : "Task 版本載入失敗。");
    }
  };
  const executeCommand = async (
    saved: PendingCommandEnvelope,
    retry = false,
    existingToken?: symbol,
  ) => {
    const token = existingToken ?? acquirePendingCommandLock(mutationLock);
    if (!token || mutationLock.current !== token) return;
    if (!scope) {
      releasePendingCommandLock(mutationLock, token);
      return;
    }
    const operationGeneration = responseGeneration.current;
    setBusy(true);
    setError("");
    try {
      const result = await request("executions", {}, saved.command);
      if (!confirmsPendingReceipt(result, saved))
        throw new Error("操作結果尚未確認；請沿用原命令重試。");
      if (!removePendingCommand(sessionStorage, saved)) return;
      setPending((current) => (samePendingCommand(current, saved) ? null : current));
      if (saved.command.action === "replace-dependencies") {
        setDependencyVersion(result.revision.version);
        setDependencyEdges(result.revision.edges);
      } else if (contract) await openContract(contract.contractId);
      else await load();
    } catch (cause) {
      if (cause instanceof StaleRequestError) return;
      if (!shouldRetainPendingCommand(cause, retry)) {
        const removed = removePendingCommand(sessionStorage, saved);
        if (removed) setPending((current) => (samePendingCommand(current, saved) ? null : current));
      }
      setError(cause instanceof Error ? cause.message : "Execution 操作結果不明，請先重新讀取。");
    } finally {
      if (operationGeneration === responseGeneration.current) setBusy(false);
      releasePendingCommandLock(mutationLock, token);
    }
  };
  const startCommand = async (command: PendingCommand, existingToken?: symbol) => {
    const token = existingToken ?? acquirePendingCommandLock(mutationLock);
    if (!token || mutationLock.current !== token) return;
    if (!scope || pending) {
      releasePendingCommandLock(mutationLock, token);
      return;
    }
    try {
      const saved = persistPendingCommand(
        sessionStorage,
        "executions",
        scope.actorUserId,
        scope.repository.id,
        command,
      );
      setPending(saved);
      await executeCommand(saved, false, token);
    } catch (cause) {
      releasePendingCommandLock(mutationLock, token);
      setError(cause instanceof Error ? cause.message : "無法安全保存操作，未送出請求。");
    }
  };
  const saveDependencies = async () => {
    if (!scope || !contract || pending) return;
    const planRevisionId = contract.lines.find((line) => line.lineId === lineId)?.content
      ?.planRevisionId;
    if (!planRevisionId) return;
    await startCommand({
      action: "replace-dependencies",
      repositoryId: scope.repository.id,
      planRevisionId,
      requestId: crypto.randomUUID(),
      expectedVersion: dependencyVersion,
      edges: dependencyEdges,
    });
  };
  const submit = async () => {
    if (
      !scope ||
      !contract ||
      !executionSubmissionAllowed(contract.state) ||
      !taskId ||
      !lineId ||
      pending
    )
      return;
    const token = acquirePendingCommandLock(mutationLock);
    if (!token) return;
    const operationGeneration = responseGeneration.current;
    setBusy(true);
    setError("");
    try {
      const task = tasks.find((item) => item.id === taskId);
      if (!task) throw new Error("Task 已變更，請重新讀取。");
      const dependencies = await request("executions", {
        view: "dependencies",
        planRevisionId:
          contract.lines.find((line) => line.lineId === lineId)?.content?.planRevisionId ?? "",
      });
      const command = {
        action: "submit",
        repositoryId: scope.repository.id,
        executionId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        expectedVersion: 0,
        contractId: contract.contractId,
        contractRevisionId: contract.revisionId,
        lineId,
        task: { planRevisionId: dependencies.dependencies.planRevisionId, nodeId: task.id },
        resources: resourceIds.map((resourceId) => {
          const resource = resources.find((item) => item.resourceId === resourceId);
          return { resourceId, resourceRevisionId: resource?.revisionId ?? "" };
        }),
        observedDependencyVersion: dependencies.dependencies.version,
        quantity,
        note,
      };
      await startCommand(command, token);
    } catch (cause) {
      if (cause instanceof StaleRequestError) return;
      setError(cause instanceof Error ? cause.message : "Execution 提交結果不明，請先重新讀取。");
    } finally {
      if (operationGeneration === responseGeneration.current) setBusy(false);
      releasePendingCommandLock(mutationLock, token);
    }
  };
  const review = async (action: "accept" | "reject" | "void") => {
    if (!scope || !selected || !contract || pending) return;
    if (
      (action === "void" && selected.state !== "ACCEPTED") ||
      (action !== "void" && selected.state !== "SUBMITTED")
    )
      return;
    const token = acquirePendingCommandLock(mutationLock);
    if (!token) return;
    const operationGeneration = responseGeneration.current;
    setBusy(true);
    try {
      const command = {
        action,
        repositoryId: scope.repository.id,
        executionId: selected.executionId,
        requestId: crypto.randomUUID(),
        expectedVersion: selected.version,
        ...(action === "reject" || action === "void" ? { reason } : {}),
      };
      await startCommand(command, token);
    } catch (cause) {
      if (cause instanceof StaleRequestError) return;
      setError(cause instanceof Error ? cause.message : "Execution 審查結果不明，請先重新讀取。");
    } finally {
      if (operationGeneration === responseGeneration.current) setBusy(false);
      releasePendingCommandLock(mutationLock, token);
    }
  };
  return (
    <div className="grid gap-4 p-4 md:grid-cols-[minmax(16rem,1fr)_2fr]">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      <Card>
        <CardHeader>
          <CardTitle>Task actuals</CardTitle>
          <CardDescription>
            ACTIVE Contract 可提交 Task 實績；CLOSED Contract 保留歷史與審查入口。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {contracts
            .filter((item) => item.state === "ACTIVE" || item.state === "CLOSED")
            .map((item) => (
              <Button
                key={item.contractId}
                variant="outline"
                disabled={busy || pending !== null}
                onClick={() => void openContract(item.contractId)}
              >
                <span>{item.title}</span>
                <Badge variant="secondary">{item.state}</Badge>
              </Button>
            ))}
          {contractNext && (
            <Button variant="outline" disabled={busy} onClick={() => void loadMore("contracts")}>
              載入更多 Contracts
            </Button>
          )}
          {contract &&
            executions.map((item) => (
              <Button
                key={item.executionId}
                variant="outline"
                className="justify-between"
                disabled={busy || pending !== null}
                onClick={() => void openExecution(item.executionId)}
              >
                <span>{item.quantity}</span>
                <Badge variant="secondary">{item.state}</Badge>
              </Button>
            ))}
          {executionNext && (
            <Button variant="outline" disabled={busy} onClick={() => void loadMore("executions")}>
              載入更多 Executions
            </Button>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{selected ? "審查 Execution" : "提交 Execution"}</CardTitle>
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
          {selected ? (
            <>
              {selected.task && selected.basis.content ? (
                <div className="grid gap-1 rounded-lg border p-3 text-sm">
                  <strong>
                    Task: {selected.task.node.title} ({selected.task.node.kind})
                  </strong>
                  <span>
                    實績：{selected.quantity} {selected.task.node.plannedQuantity?.measure.unit}
                  </span>
                  <span>
                    Contract agreed：{selected.basis.agreedQuantity}{" "}
                    {selected.basis.content.node.plannedQuantity?.measure.unit}
                  </span>
                  <span>
                    Task planned：{selected.task.node.plannedQuantity?.value ?? "未設定"}{" "}
                    {selected.task.node.plannedQuantity?.measure.unit}
                  </span>
                  <span>備註：{selected.note || "無"}</span>
                  <span>
                    Resources：
                    {selected.resources?.length
                      ? selected.resources
                          .map((resource) => `${resource.kind}: ${resource.name}`)
                          .join("、")
                      : "無"}
                  </span>
                  <span>
                    Dependency v{selected.dependency?.version ?? 0}：
                    {selected.dependency?.prerequisiteTaskIds.length
                      ? selected.dependency.prerequisiteTaskIds.join("、")
                      : "無 prerequisite"}
                  </span>
                </div>
              ) : selected.basis.resource ? (
                <div className="grid gap-1 rounded-lg border p-3 text-sm">
                  <strong>Legacy Resource report: {selected.basis.resource.name}</strong>
                  <span>
                    實績：{selected.quantity} {selected.basis.resource.measure.unit}
                  </span>
                  <span>
                    來源數量：{selected.basis.resource.sourceQuantity}{" "}
                    {selected.basis.resource.measure.unit}
                  </span>
                  <span>備註：{selected.note || "無"}</span>
                </div>
              ) : null}
              <Label>原因</Label>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={
                    !scope?.canManage || busy || pending !== null || selected.state !== "SUBMITTED"
                  }
                  onClick={() => void review("accept")}
                >
                  接受
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    !scope?.canManage ||
                    busy ||
                    pending !== null ||
                    selected.state !== "SUBMITTED" ||
                    !reason.trim()
                  }
                  onClick={() => void review("reject")}
                >
                  退回
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    !scope?.canManage ||
                    busy ||
                    pending !== null ||
                    selected.state !== "ACCEPTED" ||
                    !reason.trim()
                  }
                  onClick={() => void review("void")}
                >
                  作廢
                </Button>
              </div>
            </>
          ) : (
            <>
              <Label>Contract line</Label>
              <NativeSelect
                value={lineId}
                disabled={busy || pending !== null}
                onChange={(event) => void chooseLine(event.target.value)}
              >
                <NativeSelectOption value="">選擇 line</NativeSelectOption>
                {contract?.lines
                  .filter((line) => line.content)
                  .map((line) => (
                    <NativeSelectOption key={line.lineId} value={line.lineId}>
                      {line.content?.node.title ?? line.lineId} · {line.agreedQuantity}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
              <Label>Task</Label>
              <NativeSelect value={taskId} onChange={(event) => setTaskId(event.target.value)}>
                <NativeSelectOption value="">選擇 Task</NativeSelectOption>
                {tasks.map((task) => (
                  <NativeSelectOption key={task.id} value={task.id}>
                    {task.title} · {task.plannedQuantity?.value} {task.measureUnit}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Label>Task prerequisites</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                <NativeSelect
                  value={dependencyTaskId}
                  onChange={(event) => setDependencyTaskId(event.target.value)}
                >
                  <NativeSelectOption value="">Task</NativeSelectOption>
                  {dependencyTasks.map((task) => (
                    <NativeSelectOption key={task.id} value={task.id}>
                      {task.title}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <NativeSelect
                  value={prerequisiteTaskId}
                  onChange={(event) => setPrerequisiteTaskId(event.target.value)}
                >
                  <NativeSelectOption value="">Prerequisite</NativeSelectOption>
                  {dependencyTasks.map((task) => (
                    <NativeSelectOption key={task.id} value={task.id}>
                      {task.title}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    !scope?.canEdit ||
                    !dependencyTaskId ||
                    !prerequisiteTaskId ||
                    dependencyTaskId === prerequisiteTaskId
                  }
                  onClick={() =>
                    setDependencyEdges((current) =>
                      current.some(
                        (edge) =>
                          edge.taskId === dependencyTaskId &&
                          edge.prerequisiteTaskId === prerequisiteTaskId,
                      )
                        ? current
                        : [...current, { taskId: dependencyTaskId, prerequisiteTaskId }],
                    )
                  }
                >
                  新增 prerequisite
                </Button>
              </div>
              {dependencyEdges.map((edge) => (
                <div
                  key={`${edge.taskId}:${edge.prerequisiteTaskId}`}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span>
                    {dependencyTasks.find((task) => task.id === edge.taskId)?.title ?? edge.taskId}{" "}
                    ←{" "}
                    {dependencyTasks.find((task) => task.id === edge.prerequisiteTaskId)?.title ??
                      edge.prerequisiteTaskId}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDependencyEdges((current) => current.filter((item) => item !== edge))
                    }
                  >
                    移除
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={!scope?.canEdit || busy || pending !== null || !lineId}
                onClick={() => void saveDependencies()}
              >
                儲存 Task dependencies
              </Button>
              <Label>使用 Resources</Label>
              <div className="grid gap-2">
                {resources
                  .filter((resource) => resource.state === "ACTIVE")
                  .map((resource) => (
                    <label key={resource.resourceId} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={resourceIds.includes(resource.resourceId)}
                        onChange={(event) =>
                          setResourceIds((current) =>
                            event.target.checked
                              ? [...current, resource.resourceId]
                              : current.filter((id) => id !== resource.resourceId),
                          )
                        }
                      />
                      {resource.kind}: {resource.name}
                    </label>
                  ))}
              </div>
              {resourceNext && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void loadMore("resources")}
                >
                  載入更多 Resources
                </Button>
              )}
              <Label>完成數量</Label>
              <Input value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              <Label>備註</Label>
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
              <Button
                disabled={
                  !scope?.canEdit ||
                  busy ||
                  pending !== null ||
                  !contract ||
                  !executionSubmissionAllowed(contract.state) ||
                  !lineId ||
                  !taskId ||
                  !quantity
                }
                onClick={() => void submit()}
              >
                提交實績
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
