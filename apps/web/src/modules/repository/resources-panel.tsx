"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { PageHeading, PageState } from "../../shared/ui/page-layout";
import { ResourceContent } from "./resource-content";
import {
  repositoryDiscussionsPath,
  repositoryIssuesPath,
  repositoryLabelsPath,
  repositoryMilestonesPath,
  repositoryPath,
  repositorySettingsPath,
} from "./resource-navigation";
import styles from "./resource-navigation.module.css";
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
  const repositoryHref = repositoryPath(ownerLogin, repositoryName);
  const issuesHref = repositoryIssuesPath(ownerLogin, repositoryName);
  const discussionsHref = repositoryDiscussionsPath(ownerLogin, repositoryName);
  const labelsHref = repositoryLabelsPath(ownerLogin, repositoryName);
  const milestonesHref = repositoryMilestonesPath(ownerLogin, repositoryName);
  const settingsHref = repositorySettingsPath(ownerLogin, repositoryName);

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
        discussionId,
        discussionNumber,
        milestoneNumber,
        milestoneStatus,
        after,
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
        const value = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw { status: response.status, message: value.error ?? "Repository 資源讀取失敗。" };
        }
        if (ticket !== generation.current) return;
        const incoming = parseRepositoryResourcePage(kind, value);
        setData((current: PageData | null) =>
          mergeRepositoryResourcePage(current, incoming, append),
        );
      } catch (cause) {
        if (ticket === generation.current) {
          setData(null);
          const failure = cause as Partial<ResourceError>;
          setError({
            status: typeof failure.status === "number" ? failure.status : 503,
            message:
              typeof failure.message === "string" ? failure.message : "Repository 資源讀取失敗。",
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

  const title =
    kind === "labels"
      ? "Labels"
      : kind === "milestones" || kind === "milestone"
        ? "Milestones"
        : "Discussions";
  const restricted = error && (error.status === 401 || error.status === 403);

  return (
    <>
      <PageHeading
        title={title}
        description="查看這個儲存庫的討論、標籤與里程碑。"
        back={repositoryHref}
      />
      <nav className={styles.resourceNav} aria-label="Repository resources">
        <Link className={styles.resourceLink} href={issuesHref}>
          Issues
        </Link>
        <Link
          className={styles.resourceLink}
          href={discussionsHref}
          aria-current={kind.startsWith("discussion") ? "page" : undefined}
        >
          Discussions
        </Link>
        <Link
          className={styles.resourceLink}
          href={labelsHref}
          aria-current={kind === "labels" ? "page" : undefined}
        >
          Labels
        </Link>
        <Link
          className={styles.resourceLink}
          href={milestonesHref}
          aria-current={kind.startsWith("milestone") ? "page" : undefined}
        >
          Milestones
        </Link>
        <Link className={styles.resourceLink} href={settingsHref}>
          Settings
        </Link>
      </nav>
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
