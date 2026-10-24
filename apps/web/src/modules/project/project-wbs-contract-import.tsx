"use client";

import type { WbsEdit, WbsNode } from "@line_bot_v1/wbs/domain/document";
import { useCallback, useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import { Button } from "../../shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../shared/ui/card";
import { Input } from "../../shared/ui/input";
import { Label } from "../../shared/ui/label";
import { NativeSelect, NativeSelectOption } from "../../shared/ui/native-select";
import { Textarea } from "../../shared/ui/textarea";

type Contract = { contractId: string; title: string; state: string };
type ContractLine = {
  lineId: string;
  agreedQuantity: string;
  title: string;
  unit: string;
};
type ActiveRevision = { contractId: string; revisionId: string; lines: ContractLine[] };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Contract 回應無效。");
  return Object.fromEntries(Object.entries(value));
}
function str(value: unknown): string {
  if (typeof value !== "string") throw new Error("Contract 欄位格式無效。");
  return value;
}
function linesOf(value: unknown): ContractLine[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Contract 項次不正確。");
  return value.map((item) => {
    const line = record(item);
    const node = record(record(line.content).node);
    const quantity = node.plannedQuantity;
    const measure = quantity === null ? null : record(record(quantity).measure);
    return {
      lineId: str(line.lineId),
      agreedQuantity: str(line.agreedQuantity),
      title: str(node.title),
      unit: measure ? str(measure.unit) : "",
    };
  });
}
export default function ProjectWbsContractImport({
  liffId,
  projectId,
  actorUserId,
  nodes,
  disabled,
  onImport,
}: {
  liffId: string;
  projectId: string;
  actorUserId: string;
  nodes: readonly WbsNode[];
  disabled: boolean;
  onImport(edit: WbsEdit): void;
}) {
  const [owner, setOwner] = useState("");
  const [repository, setRepository] = useState("");
  const [repositoryId, setRepositoryId] = useState("");
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selected, setSelected] = useState<ActiveRevision | null>(null);
  const [lineId, setLineId] = useState("");
  const [parentId, setParentId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deliverable, setDeliverable] = useState("");
  const [acceptance, setAcceptance] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  const eligible = nodes.filter((node) => node.kind === "DELIVERABLE");
  const line = selected?.lines.find((item) => item.lineId === lineId);
  const resetSource = useCallback(() => {
    epoch.current++;
    setRepositoryId("");
    setContracts([]);
    setSelected(null);
    setLineId("");
    setParentId("");
    setTitle("");
    setDescription("");
    setDeliverable("");
    setAcceptance("");
    setConfirmed(false);
  }, []);
  useEffect(() => {
    const clear = () => {
      resetSource();
      setOwner("");
      setRepository("");
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") clear();
    };
    const off = liffClient.onSessionBlocked(clear);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", clear);
    return () => {
      epoch.current++;
      off();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", clear);
    };
  }, [resetSource]);
  async function request(query: Record<string, string>) {
    const ticket = epoch.current;
    const generation = await liffClient.ensureSession(liffId);
    if (ticket !== epoch.current) throw new Error("Contract 來源已變更。");
    if (!generation) throw new Error("請先完成 LINE 登入。");
    const search = new URLSearchParams({ owner, name: repository, ...query });
    const response = await fetch("/api/repository-contracts?" + search.toString(), {
      cache: "no-store",
      headers: { "X-App-Session-Generation": generation },
    });
    const payload: unknown = await response.json();
    if (ticket !== epoch.current) throw new Error("Contract 來源已變更。");
    if (!response.ok) {
      if ([401, 403, 404].includes(response.status)) resetSource();
      const value = record(payload);
      throw new Error(typeof value.error === "string" ? value.error : "Contract 來源無法存取。");
    }
    return record(payload);
  }
  async function loadContracts() {
    if (busy || disabled || !owner.trim() || !repository.trim()) return;
    resetSource();
    setBusy(true);
    setError("");
    try {
      const result = await request({});
      if (result.actorUserId !== actorUserId)
        throw new Error("Project 與 Contract 的登入身分不同。");
      const items = result.contracts;
      if (!Array.isArray(items)) throw new Error("Contract 清單無效。");
      const mapped = items.map((value): Contract => {
        const row = record(value);
        return { contractId: str(row.contractId), title: str(row.title), state: str(row.state) };
      });
      setRepositoryId(str(record(result.repository).id));
      setContracts(mapped.filter((value) => value.state === "ACTIVE"));
    } catch (cause) {
      resetSource();
      setError(cause instanceof Error ? cause.message : "Contract 載入失敗。");
    } finally {
      setBusy(false);
    }
  }
  async function openContract(contractId: string) {
    setSelected(null);
    setLineId("");
    setParentId("");
    setTitle("");
    setConfirmed(false);
    if (!contractId || disabled || !repositoryId) return;
    const ticket = epoch.current;
    setBusy(true);
    setError("");
    try {
      const result = await request({ contractId });
      if (ticket !== epoch.current) return;
      if (str(record(result.repository).id) !== repositoryId || result.actorUserId !== actorUserId)
        throw new Error("Contract 來源身分或 Repository 不一致。");
      const revision = record(result.revision);
      if (revision.state !== "ACTIVE" || revision.contractId !== contractId)
        throw new Error("只能選擇目前 ACTIVE 的 Contract。");
      setSelected({
        contractId,
        revisionId: str(revision.revisionId),
        lines: linesOf(revision.lines),
      });
    } catch (cause) {
      setSelected(null);
      setError(cause instanceof Error ? cause.message : "Contract 明細載入失敗。");
    } finally {
      setBusy(false);
    }
  }
  function selectLine(id: string) {
    setLineId(id);
    setTitle(selected?.lines.find((item) => item.lineId === id)?.title ?? "");
    setConfirmed(false);
  }
  function submit() {
    if (
      disabled ||
      busy ||
      !confirmed ||
      !selected ||
      !repositoryId ||
      !line ||
      !title.trim() ||
      !eligible.some((node) => node.id === parentId)
    )
      return;
    onImport({
      action: "import-contract",
      confirmedDisclosure: true,
      source: {
        repositoryId,
        contractId: selected.contractId,
        contractRevisionId: selected.revisionId,
        lineId: line.lineId,
      },
      node: {
        id: crypto.randomUUID(),
        parentId,
        position: nodes.filter((node) => node.parentId === parentId).length,
        kind: "WORK_PACKAGE",
        title: title.trim(),
        description,
        deliverable,
        acceptanceCriteria: acceptance,
      },
    });
    setConfirmed(false);
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>從正式 Contract 對應 WBS 工作包</CardTitle>
        <CardDescription>
          選擇有權讀取的 Repository ACTIVE Contract，人工對應 Project Deliverable。
          不複製約定數量或自動發布 Baseline，正式命令會重驗雙方授權。
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor="contract-repository-owner">Contract Repository Owner Login</Label>
            <Input
              id="contract-repository-owner"
              value={owner}
              disabled={disabled || busy}
              onChange={(event) => {
                resetSource();
                setOwner(event.target.value);
              }}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="contract-repository-name">Contract Repository Name</Label>
            <Input
              id="contract-repository-name"
              value={repository}
              disabled={disabled || busy}
              onChange={(event) => {
                resetSource();
                setRepository(event.target.value);
              }}
            />
          </div>
        </div>
        <Button
          variant="outline"
          type="button"
          disabled={disabled || busy || !owner.trim() || !repository.trim()}
          onClick={() => void loadContracts()}
        >
          讀取可用 ACTIVE Contracts
        </Button>
        {repositoryId && (
          <>
            <Label htmlFor="contract-revision-choice">選擇合約</Label>
            <NativeSelect
              id="contract-revision-choice"
              value={selected?.contractId ?? ""}
              disabled={busy || disabled}
              onChange={(event) => void openContract(event.target.value)}
            >
              <NativeSelectOption value="">選擇 ACTIVE Contract</NativeSelectOption>
              {contracts.map((item) => (
                <NativeSelectOption key={item.contractId} value={item.contractId}>
                  {item.title}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </>
        )}
        {selected && (
          <>
            <Label htmlFor="contract-line-choice">精確 Contract 項次</Label>
            <NativeSelect
              id="contract-line-choice"
              value={lineId}
              disabled={busy || disabled}
              onChange={(event) => selectLine(event.target.value)}
            >
              <NativeSelectOption value="">選擇合約項次</NativeSelectOption>
              {selected.lines.map((item) => (
                <NativeSelectOption key={item.lineId} value={item.lineId}>
                  {item.title} · {item.agreedQuantity} {item.unit}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </>
        )}
        {line && (
          <>
            <p className="text-xs text-muted-foreground">
              Pinned Contract Revision：{selected?.revisionId}。來源約定數量僅供核對， 不成為
              Project WBS 的第二份數量事實。
            </p>
            <Label htmlFor="contract-wbs-parent">指定 WBS Deliverable</Label>
            <NativeSelect
              id="contract-wbs-parent"
              value={parentId}
              disabled={disabled || busy}
              onChange={(event) => {
                setParentId(event.target.value);
                setConfirmed(false);
              }}
            >
              <NativeSelectOption value="">請選擇既有父節點</NativeSelectOption>
              {eligible.map((node) => (
                <NativeSelectOption key={node.id} value={node.id}>
                  {node.title}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Label htmlFor="contract-wbs-title">確認工作包名稱</Label>
            <Input
              id="contract-wbs-title"
              value={title}
              maxLength={200}
              disabled={disabled || busy}
              onChange={(event) => {
                setTitle(event.target.value);
                setConfirmed(false);
              }}
            />
            <Label htmlFor="contract-wbs-description">工作包說明</Label>
            <Textarea
              id="contract-wbs-description"
              value={description}
              disabled={disabled || busy}
              onChange={(event) => {
                setDescription(event.target.value);
                setConfirmed(false);
              }}
            />
            <Label htmlFor="contract-wbs-deliverable">交付成果</Label>
            <Textarea
              id="contract-wbs-deliverable"
              value={deliverable}
              disabled={disabled || busy}
              onChange={(event) => {
                setDeliverable(event.target.value);
                setConfirmed(false);
              }}
            />
            <Label htmlFor="contract-wbs-acceptance">驗收準則</Label>
            <Textarea
              id="contract-wbs-acceptance"
              value={acceptance}
              disabled={disabled || busy}
              onChange={(event) => {
                setAcceptance(event.target.value);
                setConfirmed(false);
              }}
            />
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={disabled || busy}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              我已確認此 Contract 項次的來源及對應 WBS，並同意將工作包放入目標 Project， 即使
              Project 可讀者與 Contract 可讀者不同。
            </label>
            <Button
              type="button"
              disabled={
                disabled ||
                busy ||
                !confirmed ||
                !title.trim() ||
                !eligible.some((node) => node.id === parentId)
              }
              onClick={submit}
            >
              確認新增 Project WBS 工作包
            </Button>
          </>
        )}
        {eligible.length === 0 && (
          <p className="text-sm text-muted-foreground">請先建立 WBS Deliverable 父節點。</p>
        )}
        <p className="text-xs text-muted-foreground">
          Project：{projectId}。新增後仍是 WBS 草稿，需獨立治理審核與 Baseline 發布。
        </p>
      </CardContent>
    </Card>
  );
}
