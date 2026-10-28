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

type Kind = "LOCATION" | "EQUIPMENT" | "MATERIAL";
const kinds: readonly Kind[] = ["LOCATION", "EQUIPMENT", "MATERIAL"];
class StaleRequestError extends Error {}
type Summary = {
  resourceId: string;
  revisionId: string;
  version: number;
  kind: Kind;
  name: string;
  state: "ACTIVE" | "ARCHIVED";
  updatedAt: number;
};
type Revision = Summary & { description: string };
type View = {
  actorUserId: string;
  repository: { id: string };
  canEdit: boolean;
  canManage: boolean;
  resources: Summary[];
  next: string | null;
};
export default function ResourcesPanel({
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
  const [kind, setKind] = useState<Kind>("LOCATION");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [pending, setPending] = useState<PendingCommandEnvelope | null>(null);
  const responseGeneration = useRef(0);
  const mutationLock = useRef<symbol | null>(null);
  const clear = useCallback(() => {
    responseGeneration.current++;
    mutationLock.current = null;
    setView(null);
    setSelected(null);
    setKind("LOCATION");
    setName("");
    setDescription("");
    setPending(null);
    setError("");
    setBusy(false);
    onCanManageChange(false);
  }, [onCanManageChange]);
  const request = useCallback(
    async (query: Record<string, string> = {}, command?: object) => {
      const ticket = responseGeneration.current;
      try {
        const generation = await liffClient.ensureSession(liffId);
        if (ticket !== responseGeneration.current) throw new StaleRequestError();
        if (!generation) throw new Error("請完成 LINE 登入。");
        const search = new URLSearchParams({ owner: ownerLogin, name: repositoryName, ...query });
        const response = await fetch(`/api/repository-resources?${search}`, {
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
          throw Object.assign(new Error(value.error ?? JSON.stringify(value)), {
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
      const next: View = await request();
      setView(next);
      setPending(
        restorePendingCommand(sessionStorage, "resources", next.actorUserId, next.repository.id),
      );
      onCanManageChange(next.canManage);
    } catch (cause) {
      if (cause instanceof StaleRequestError) return;
      setError(cause instanceof Error ? cause.message : String(cause));
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
  const open = async (resourceId: string) => {
    const operationGeneration = responseGeneration.current;
    setBusy(true);
    try {
      const result = await request({ resourceId });
      setSelected(result.revision);
      setKind(result.revision.kind);
      setName(result.revision.name);
      setDescription(result.revision.description);
    } catch (cause) {
      if (cause instanceof StaleRequestError) return;
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (operationGeneration === responseGeneration.current) setBusy(false);
    }
  };
  const loadMore = async () => {
    if (!view?.next) return;
    const operationGeneration = responseGeneration.current;
    setBusy(true);
    try {
      const next: View = await request({ after: view.next });
      setView((current) =>
        current
          ? {
              ...current,
              resources: [
                ...current.resources,
                ...next.resources.filter(
                  (item) =>
                    !current.resources.some((existing) => existing.resourceId === item.resourceId),
                ),
              ],
              next: next.next,
            }
          : next,
      );
    } catch (cause) {
      if (cause instanceof StaleRequestError) return;
      setError(cause instanceof Error ? cause.message : String(cause));
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
      const result = await request({}, saved.command);
      if (!confirmsPendingReceipt(result, saved))
        throw new Error(JSON.stringify(result));
      if (!removePendingCommand(sessionStorage, saved)) return;
      setPending((current) => (samePendingCommand(current, saved) ? null : current));
      setSelected(result.revision);
      setName(result.revision.name);
      setDescription(result.revision.description);
      await load();
    } catch (cause) {
      if (cause instanceof StaleRequestError) return;
      if (!shouldRetainPendingCommand(cause, retry)) {
        const removed = removePendingCommand(sessionStorage, saved);
        if (removed) setPending((current) => (samePendingCommand(current, saved) ? null : current));
      }
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (operationGeneration === responseGeneration.current) setBusy(false);
      releasePendingCommandLock(mutationLock, token);
    }
  };
  const execute = async (action: "create" | "edit" | "archive" | "unarchive") => {
    if (!view || pending) return;
    const token = acquirePendingCommandLock(mutationLock);
    if (!token) return;
    try {
      const saved = persistPendingCommand(
        sessionStorage,
        "resources",
        view.actorUserId,
        view.repository.id,
        {
          action,
          repositoryId: view.repository.id,
          resourceId: selected?.resourceId ?? crypto.randomUUID(),
          requestId: crypto.randomUUID(),
          expectedVersion: selected?.version ?? 0,
          ...(action === "create"
            ? { kind, name, description }
            : action === "edit"
              ? { name, description }
              : {}),
        },
      );
      setPending(saved);
      await executeCommand(saved, false, token);
    } catch (cause) {
      releasePendingCommandLock(mutationLock, token);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return (
    <div className="grid gap-4 p-4 md:grid-cols-[minmax(16rem,1fr)_2fr]">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      <Card>
        <CardHeader>
          <CardTitle>實體資源</CardTitle>
          <CardDescription>Location、Equipment、Material 的版本化身份。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {view?.resources.length
            ? view.resources.map((resource) => (
                <Button
                  key={resource.resourceId}
                  variant="outline"
                  className="justify-between"
                  onClick={() => void open(resource.resourceId)}
                >
                  <span>{resource.name}</span>
                  <Badge variant="secondary">{resource.kind}</Badge>
                </Button>
              ))
            : !busy && <p className="text-sm text-muted-foreground">目前沒有 Resource。</p>}
          {view?.next && (
            <Button variant="outline" disabled={busy} onClick={() => void loadMore()}>
              載入更多 Resources
            </Button>
          )}
          <Button
            variant="outline"
            disabled={!view?.canEdit}
            onClick={() => {
              setSelected(null);
              setName("");
              setDescription("");
            }}
          >
            新增 Resource
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{selected ? selected.name : "新增 Resource"}</CardTitle>
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
          <Label>類型</Label>
          <NativeSelect
            value={kind}
            disabled={Boolean(selected)}
            onChange={(event) => {
              const next = kinds.find((value) => value === event.target.value);
              if (next) setKind(next);
            }}
          >
            <NativeSelectOption value="LOCATION">Location</NativeSelectOption>
            <NativeSelectOption value="EQUIPMENT">Equipment</NativeSelectOption>
            <NativeSelectOption value="MATERIAL">Material</NativeSelectOption>
          </NativeSelect>
          <Label>名稱</Label>
          <Input
            value={name}
            disabled={!view?.canEdit}
            onChange={(event) => setName(event.target.value)}
          />
          <Label>說明</Label>
          <Textarea
            value={description}
            disabled={!view?.canEdit}
            onChange={(event) => setDescription(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!view?.canEdit || busy || pending !== null || !name.trim()}
              onClick={() => void execute(selected ? "edit" : "create")}
            >
              {selected ? "儲存新版本" : "建立"}
            </Button>
            {selected && (
              <Button
                variant="outline"
                disabled={!view?.canEdit || busy || pending !== null}
                onClick={() =>
                  void execute(selected.state === "ARCHIVED" ? "unarchive" : "archive")
                }
              >
                {selected.state === "ARCHIVED" ? "解除封存" : "封存"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
