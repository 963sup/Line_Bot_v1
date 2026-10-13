"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { PageState } from "../../shared/ui/page-layout";
import RepositoryPageHeader from "./repository-page-header";
import { ResourceContent } from "./resource-content";
import {
  type MilestoneStatus,
  mergeRepositoryResourcePage,
  type PageData,
  parseRepositoryResourcePage,
  type ResourceError,
  type ResourcesKind,
  repositoryResourcesEndpoint,
} from "./resource-page-model";

export default function RepositoryResourcesPanel({
  liffId,
  ownerLogin,
  repositoryName,
  kind,
  discussionId,
  discussionNumber,
  milestoneNumber,
}: {
  liffId: string;
  ownerLogin: string;
  repositoryName: string;
  kind: ResourcesKind;
  discussionId?: string;
  discussionNumber?: number;
  milestoneNumber?: number;
}) {
  const [data, setData] = useState<PageData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ResourceError | null>(null);
  const [milestoneStatus, setMilestoneStatus] = useState<MilestoneStatus>("open");
  const [ready, setReady] = useState(false);
  const generation = useRef(0);
  const dataRef = useRef<PageData | null>(null);
  const readyRef = useRef(false);

  const clear = useCallback(() => {
    generation.current++;
    setData(null);
    setBusy(false);
    setError(null);
  }, []);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  const endpoint = useCallback(
    (after?: string) =>
      repositoryResourcesEndpoint({
        ownerLogin,
        repositoryName,
        kind,
        ...(discussionId !== undefined ? { discussionId } : {}),
        ...(discussionNumber !== undefined ? { discussionNumber } : {}),
        ...(milestoneNumber !== undefined ? { milestoneNumber } : {}),
        milestoneStatus,
        ...(after !== undefined ? { after } : {}),
      }),
    [
      discussionId,
      discussionNumber,
      kind,
      milestoneNumber,
      milestoneStatus,
      ownerLogin,
      repositoryName,
    ],
  );

  const load = useCallback(
    async (append = false) => {
      if (!readyRef.current) return;
      const ticket = ++generation.current;
      setBusy(true);
      setError(null);
      try {
        const token = await liffClient.ensureSession(liffId);
        if (!token) {
          if (ticket === generation.current) {
            setData(null);
            setError({ status: 401, message: "請完成 LINE 登入後重試。" });
          }
          return;
        }
        const current = dataRef.current;
        const nextCursor = append && current && "next" in current ? current.next : undefined;
        const response = await fetch(endpoint(nextCursor || undefined), {
          headers: { "X-App-Session-Generation": token },
          cache: "no-store",
        });
        const value: unknown = await response.json();
        if (!response.ok) {
          const message =
            value !== null &&
            typeof value === "object" &&
            "error" in value &&
            typeof value.error === "string"
              ? value.error
              : "Repository 資源讀取失敗。";
          throw { status: response.status, message };
        }
        if (ticket !== generation.current) return;
        const incoming = parseRepositoryResourcePage(kind, value);
        setData((current: PageData | null) =>
          mergeRepositoryResourcePage(current, incoming, append),
        );
      } catch (cause) {
        if (ticket === generation.current) {
          setData(null);
          const failure = cause !== null && typeof cause === "object" ? cause : {};
          setError({
            status:
              "status" in failure && typeof failure.status === "number" ? failure.status : 503,
            message:
              "message" in failure && typeof failure.message === "string"
                ? failure.message
                : "Repository 資源讀取失敗。",
          });
        }
      } finally {
        if (ticket === generation.current) setBusy(false);
      }
    },
    [endpoint, kind, liffId],
  );

  useEffect(() => {
    clear();
    if (readyRef.current && document.visibilityState !== "hidden") void load();
  }, [clear, load]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") clear();
      else if (readyRef.current) void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      generation.current++;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [clear, load]);

  const restricted = error && (error.status === 401 || error.status === 403);

  return (
    <>
      <RepositoryPageHeader
        ownerLogin={ownerLogin}
        repositoryName={repositoryName}
        active={
          kind.startsWith("discussion")
            ? "discussions"
            : kind === "labels"
              ? "labels"
              : "milestones"
        }
        canManage={data?.repository.permissions.includes("admin") ?? false}
      />
      <MiniAppRuntime
        liffId={liffId}
        onReady={async () => {
          readyRef.current = true;
          setReady(true);
          await load();
        }}
        onWait={() => {
          readyRef.current = false;
          setReady(false);
          clear();
        }}
      />
      {kind === "milestones" && (
        <nav className="segmented-control" aria-label="Milestone 狀態">
          {(["open", "closed"] as const).map((status) => (
            <button
              key={status}
              type="button"
              className="secondary"
              aria-pressed={milestoneStatus === status}
              disabled={busy}
              onClick={() => {
                setMilestoneStatus(status);
              }}
            >
              {status === "open" ? "Open" : "Closed"}
            </button>
          ))}
        </nav>
      )}
      {busy && <p role="status">正在讀取 Repository 資源…</p>}
      {restricted && (
        <PageState tone="restricted" title="沒有可讀取的儲存庫資源">
          {error.message}
        </PageState>
      )}
      {error && !restricted && (
        <PageState
          tone="error"
          title="Repository 資源讀取失敗"
          action={
            <button type="button" className="secondary" disabled={busy} onClick={() => void load()}>
              重新載入
            </button>
          }
        >
          {error.message}
        </PageState>
      )}
      {!error && data && (
        <ResourceContent data={data} ownerLogin={ownerLogin} repositoryName={repositoryName} />
      )}
      {!error && data && "next" in data && data.next && (
        <button type="button" className="secondary" disabled={busy} onClick={() => void load(true)}>
          載入更多
        </button>
      )}
    </>
  );
}
