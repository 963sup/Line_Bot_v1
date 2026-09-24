"use client";

import type {
  RepositoryDiscussionResult,
  RepositoryDiscussionsResult,
  RepositoryLabelsResult,
  RepositoryMilestoneResult,
  RepositoryMilestonesResult,
} from "@line-work/repository/application/ports/resources";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { PageHeading, PageState } from "../../shared/ui/page-layout";
import {
  repositoryDiscussionsPath,
  repositoryIssuesPath,
  repositoryLabelsPath,
  repositoryMilestonesPath,
  repositoryPath,
} from "./resource-navigation";
import styles from "./resource-navigation.module.css";

type ResourcesKind = "discussions" | "discussion" | "labels" | "milestones" | "milestone";
type MilestoneStatus = "open" | "closed";

type PageData =
  | ({ kind: "discussions" } & RepositoryDiscussionsResult)
  | ({ kind: "discussion" } & RepositoryDiscussionResult)
  | ({ kind: "labels" } & RepositoryLabelsResult)
  | ({ kind: "milestones" } & RepositoryMilestonesResult)
  | ({ kind: "milestone" } & RepositoryMilestoneResult);

type ResourceError = { message: string; status: number };

function dateTime(value: number) {
  return new Date(value).toLocaleString("zh-TW");
}

function swatch(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : `#${color.replaceAll("#", "")}`;
}

function discussionPath(ownerLogin: string, repositoryName: string, discussionId: string) {
  return `${repositoryDiscussionsPath(ownerLogin, repositoryName)}/${encodeURIComponent(discussionId)}`;
}

function milestonePath(ownerLogin: string, repositoryName: string, number: number) {
  return `${repositoryMilestonesPath(ownerLogin, repositoryName)}/${encodeURIComponent(String(number))}`;
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pageData(kind: ResourcesKind, value: unknown): PageData {
  if (!isRecord(value) || !isRecord(value.repository)) {
    throw { status: 503, message: "Repository 資源回應格式不正確。" };
  }
  if (kind === "discussions" && Array.isArray(value.discussions)) {
    return { ...(value as RepositoryDiscussionsResult), kind };
  }
  if (kind === "discussion" && isRecord(value.discussion) && Array.isArray(value.comments)) {
    return { ...(value as RepositoryDiscussionResult), kind };
  }
  if (kind === "labels" && Array.isArray(value.labels)) {
    return { ...(value as RepositoryLabelsResult), kind };
  }
  if (kind === "milestones" && Array.isArray(value.milestones)) {
    return { ...(value as RepositoryMilestonesResult), kind };
  }
  if (kind === "milestone" && isRecord(value.milestone)) {
    return { ...(value as RepositoryMilestoneResult), kind };
  }
  throw { status: 503, message: "Repository 資源回應格式不正確。" };
}

export default function RepositoryResourcesPanel({
  liffId,
  ownerLogin,
  repositoryName,
  kind,
  discussionId,
  milestoneNumber,
}: {
  liffId: string;
  ownerLogin: string;
  repositoryName: string;
  kind: ResourcesKind;
  discussionId?: string;
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
    (after?: string) => {
      const query = new URLSearchParams({ owner: ownerLogin, name: repositoryName });
      if (after) {
        if (kind === "discussion") query.set("commentsAfter", after);
        else query.set("after", after);
      }
      if (kind === "milestones") query.set("status", milestoneStatus);
      if (kind === "discussion" && discussionId) {
        return `/api/discussions/${encodeURIComponent(discussionId)}?${query}`;
      }
      if (kind === "labels") return `/api/repository-labels?${query}`;
      if (kind === "milestones") return `/api/repository-milestones?${query}`;
      if (kind === "milestone" && milestoneNumber) {
        return `/api/repository-milestones/${encodeURIComponent(String(milestoneNumber))}?${query}`;
      }
      return `/api/discussions?${query}`;
    },
    [discussionId, kind, milestoneNumber, milestoneStatus, ownerLogin, repositoryName],
  );

  const load = useCallback(
    async (append = false) => {
      if (!readyRef.current) return;
      const ticket = ++generation.current;
      setBusy(true);
      setError(null);
      try {
        const token = await liffClient.session(liffId);
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
          headers: { "x-line-token": token },
          cache: "no-store",
        });
        const value = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw { status: response.status, message: value.error ?? "Repository 資源讀取失敗。" };
        }
        if (ticket !== generation.current) return;
        const incoming = pageData(kind, value);
        setData((current: PageData | null) => mergePage(current, incoming, append));
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

function mergePage(current: PageData | null, incoming: PageData, append: boolean): PageData {
  if (!append || !current || current.kind !== incoming.kind) return incoming;
  if (current.kind === "discussions" && incoming.kind === "discussions") {
    return { ...incoming, discussions: mergeById(current.discussions, incoming.discussions) };
  }
  if (current.kind === "labels" && incoming.kind === "labels") {
    return { ...incoming, labels: mergeById(current.labels, incoming.labels) };
  }
  if (current.kind === "milestones" && incoming.kind === "milestones") {
    return { ...incoming, milestones: mergeById(current.milestones, incoming.milestones) };
  }
  if (current.kind === "discussion" && incoming.kind === "discussion") {
    return { ...incoming, comments: mergeById(current.comments, incoming.comments) };
  }
  return incoming;
}

function ResourceContent({
  data,
  ownerLogin,
  repositoryName,
}: {
  data: PageData;
  ownerLogin: string;
  repositoryName: string;
}) {
  if (data.kind === "discussions") {
    if (!data.discussions.length) {
      return <PageState title="目前沒有 Discussions">這個儲存庫目前沒有可讀取的討論。</PageState>;
    }
    return (
      <ul className="notification-list">
        {data.discussions.map((discussion) => (
          <li key={discussion.id}>
            <Link
              className="notification-item"
              href={discussionPath(ownerLogin, repositoryName, discussion.id)}
            >
              <span>
                <strong>{discussion.title}</strong>
                <small>
                  {discussion.category} · {discussion.author} · {dateTime(discussion.updatedAt)}
                </small>
              </span>
              <span className="notification-state">v{discussion.version}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  if (data.kind === "discussion") {
    return (
      <article className="detail-card">
        <Link className="back-link" href={repositoryDiscussionsPath(ownerLogin, repositoryName)}>
          ← 返回 Discussions
        </Link>
        <h2>{data.discussion.title}</h2>
        <p>
          {data.discussion.category} · {data.discussion.author} · v{data.discussion.version}
        </p>
        <p>{data.discussion.body}</p>
        <h3>Comments</h3>
        {!data.comments.length && <p className="empty-copy">目前沒有留言。</p>}
        <ol>
          {data.comments.map((comment) => (
            <li key={comment.id}>
              <p>{comment.body}</p>
              <small>
                {comment.author} · {dateTime(comment.createdAt)} · v{comment.version}
              </small>
            </li>
          ))}
        </ol>
      </article>
    );
  }
  if (data.kind === "labels") {
    if (!data.labels.length) {
      return <PageState title="目前沒有 Labels">這個儲存庫目前沒有可讀取的標籤。</PageState>;
    }
    return (
      <div className="discovery-list">
        {data.labels.map((label) => (
          <article className="discovery-item" key={label.id}>
            <div className="discovery-copy">
              <h2>
                <span
                  aria-hidden="true"
                  style={{
                    backgroundColor: swatch(label.color),
                    display: "inline-block",
                    height: 12,
                    width: 12,
                  }}
                />{" "}
                {label.name}
              </h2>
              <p>{label.description || "沒有描述。"}</p>
              <div className="discovery-meta">
                <span>{label.color}</span>
                <span>v{label.version}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    );
  }
  if (data.kind === "milestones") {
    if (!data.milestones.length) {
      return <PageState title="目前沒有 Milestones">這個狀態下沒有可讀取的 milestone。</PageState>;
    }
    return (
      <ul className="notification-list">
        {data.milestones.map((milestone) => (
          <li key={milestone.id}>
            <Link
              className="notification-item"
              href={milestonePath(ownerLogin, repositoryName, milestone.number)}
            >
              <span>
                <strong>
                  #{milestone.number} {milestone.title}
                </strong>
                <small>
                  {milestone.status} ·{" "}
                  {milestone.dueAt ? `到期 ${dateTime(milestone.dueAt)}` : "無到期日"}
                </small>
              </span>
              <span className="notification-state">v{milestone.version}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <article className="detail-card">
      <Link className="back-link" href={repositoryMilestonesPath(ownerLogin, repositoryName)}>
        ← 返回 Milestones
      </Link>
      <h2>
        #{data.milestone.number} {data.milestone.title}
      </h2>
      <p>
        {data.milestone.status} · v{data.milestone.version}
      </p>
      <p>{data.milestone.description || "沒有描述。"}</p>
      <p>{data.milestone.dueAt ? `到期 ${dateTime(data.milestone.dueAt)}` : "無到期日"}</p>
    </article>
  );
}
