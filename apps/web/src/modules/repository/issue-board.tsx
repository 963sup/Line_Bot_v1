"use client";

import type { IssueCommand, IssueSnapshot } from "@line-work/repository/application/ports/issues";
import type { IssueAction, IssueStatus } from "@line-work/repository/domain";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { PageHeading, PrimaryLink } from "../../shared/ui/page-layout";
import {
  clearPendingIssueCommand,
  type PendingIssueCommand,
  restorePendingIssueCommand,
  savePendingIssueCommand,
} from "./issue-pending-storage";
import {
  repositoryDiscussionsPath,
  repositoryIssuePath,
  repositoryIssuesPath,
  repositoryLabelsPath,
  repositoryMilestonesPath,
} from "./resource-navigation";
import styles from "./resource-navigation.module.css";

const statusLabel: Record<IssueStatus, string> = {
  pending: "待承接",
  active: "進行中",
  review: "待驗收",
  completed: "已完成",
};

const actionLabel: Record<IssueAction, string> = {
  accept: "確認承接",
  report: "送交驗收",
  reject: "退回改善",
  approve: "驗收通過",
};

type IssueView = "all" | "mine" | "created";

export default function IssueBoard({
  liffId,
  repositoryId,
  ownerLogin,
  repositoryName,
  issueNumber,
  initialCreating = false,
}: {
  liffId: string;
  repositoryId?: string;
  ownerLogin?: string;
  repositoryName?: string;
  issueNumber?: number;
  initialCreating?: boolean;
}) {
  const detailMode = issueNumber !== undefined;
  const canonicalRepository = Boolean(ownerLogin && repositoryName);
  const canonicalIssuesHref =
    ownerLogin && repositoryName
      ? repositoryIssuesPath(ownerLogin, repositoryName)
      : "/repositories";
  const [data, setData] = useState<IssueSnapshot | null>(null);
  const [selectedRepository, setSelectedRepository] = useState(repositoryId ?? "");
  const [view, setView] = useState<IssueView>("all");
  const [creating, setCreating] = useState(initialCreating);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<PendingIssueCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const routeKey = `${repositoryId ?? ""}:${ownerLogin ?? ""}:${repositoryName ?? ""}:${
    issueNumber ?? ""
  }:${initialCreating ? "create" : "view"}`;
  const observedRouteKey = useRef(routeKey);

  function rememberPending(value: PendingIssueCommand) {
    savePendingIssueCommand(sessionStorage, value);
    setPending(value);
  }

  function forgetPending(value: PendingIssueCommand) {
    const cleared = clearPendingIssueCommand(sessionStorage, value);
    if (!cleared) return;
    setPending((current) =>
      current?.command.requestId === value.command.requestId ? null : current,
    );
  }

  const clearAuthorizedState = useCallback(() => {
    setData(null);
    setPending(null);
    setCreating(false);
    setNote("");
    setNotice("");
    setBusy(false);
  }, []);

  async function requestSnapshot(
    token: string,
    nextRepository = selectedRepository,
    nextView = view,
  ) {
    if (issueNumber !== undefined) {
      const detailQuery = new URLSearchParams();
      if (ownerLogin && repositoryName) {
        detailQuery.set("owner", ownerLogin);
        detailQuery.set("name", repositoryName);
      }
      const suffix = detailQuery.size ? `?${detailQuery}` : "";
      const response = await fetch(`/api/issues/${issueNumber}${suffix}`, {
        headers: { "x-line-token": token },
        cache: "no-store",
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Issue 讀取失敗。");
      const snapshot = value as IssueSnapshot;
      if (repositoryId && snapshot.issues[0]?.repositoryId !== repositoryId) {
        throw new Error("Issue 不屬於指定儲存庫。");
      }
      return snapshot;
    }
    const query = new URLSearchParams({ issueView: nextView });
    if (ownerLogin && repositoryName) {
      query.set("owner", ownerLogin);
      query.set("name", repositoryName);
    } else if (nextRepository) {
      query.set("repository", nextRepository);
    }
    const response = await fetch(`/api/issues?${query}`, {
      headers: { "x-line-token": token },
      cache: "no-store",
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || "Issue 讀取失敗。");
    return value as IssueSnapshot;
  }

  async function load(nextRepository = selectedRepository, nextView = view) {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const token = await liffClient.session(liffId);
      if (!token || ticket !== generation.current) return;
      const snapshot = await requestSnapshot(token, nextRepository, nextView);
      if (ticket !== generation.current) return;
      const routedRepository = snapshot.repositories.find(
        (item) =>
          ownerLogin &&
          repositoryName &&
          item.ownerLogin === ownerLogin.toLowerCase() &&
          item.name.toLowerCase() === repositoryName.toLowerCase(),
      );
      const nextId =
        routedRepository?.id ||
        nextRepository ||
        snapshot.issues[0]?.repositoryId ||
        snapshot.repositories[0]?.id ||
        "";
      setSelectedRepository(nextId);
      setData(snapshot);
      setPending(restorePendingIssueCommand(sessionStorage, snapshot.userId, nextId));
    } catch (cause) {
      if (ticket === generation.current) {
        setData(null);
        setError(cause instanceof Error ? cause.message : "Issue 讀取失敗。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  async function submit(command: IssueCommand) {
    if (!data || busy) return;
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    const pendingCommand = { owner: data.userId, command };
    rememberPending(pendingCommand);
    try {
      const token = await liffClient.session(liffId);
      if (!token) throw new Error("請重新登入 LINE。");
      const response = await fetch("/api/issues", {
        method: "POST",
        headers: {
          "x-line-token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(command),
      });
      const value = await response.json();
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) forgetPending(pendingCommand);
        throw new Error(value.error || "結果尚未確認，請重試原操作。");
      }
      forgetPending(pendingCommand);
      if (ticket !== generation.current) return;
      setCreating(false);
      setNote("");
      setNotice("Issue 已更新。");
      const tokenAfter = await liffClient.session(liffId);
      if (!tokenAfter || ticket !== generation.current) return;
      setData(await requestSnapshot(tokenAfter, command.repositoryId, view));
    } catch (cause) {
      if (ticket === generation.current) {
        setError(cause instanceof Error ? cause.message : "結果尚未確認，請重試原操作。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  useEffect(() => {
    if (observedRouteKey.current === routeKey) return;
    observedRouteKey.current = routeKey;
    generation.current++;
    clearAuthorizedState();
    setError("");
    setView("all");
    setCreating(initialCreating);
    setSelectedRepository(repositoryId ?? "");
  }, [clearAuthorizedState, initialCreating, routeKey, repositoryId]);

  const current = detailMode ? data?.issues[0] : undefined;
  const currentRepository = data?.repositories.find((item) => item.id === selectedRepository);
  const canWrite =
    currentRepository?.capability === "write" || currentRepository?.capability === "admin";
  const headingActions = !detailMode ? (
    <PrimaryLink href="/explore">探索儲存庫</PrimaryLink>
  ) : undefined;

  function operate(action: IssueAction) {
    if (!current) return;
    void submit({
      requestId: crypto.randomUUID(),
      repositoryId: current.repositoryId,
      issueId: current.id,
      expectedVersion: current.version,
      action,
      note,
    });
  }

  return (
    <>
      <PageHeading
        title={detailMode ? "Issue" : canonicalRepository ? "Issues" : "儲存庫"}
        description="儲存庫擁有 Issue；Project 只引用工作，不改寫 Issue truth。"
        actions={headingActions}
      />
      {canonicalRepository && ownerLogin && repositoryName && (
        <nav className={styles.resourceNav} aria-label="Repository resources">
          <Link
            className={styles.resourceLink}
            href={repositoryIssuesPath(ownerLogin, repositoryName)}
            aria-current="page"
          >
            Issues
          </Link>
          <Link
            className={styles.resourceLink}
            href={repositoryDiscussionsPath(ownerLogin, repositoryName)}
          >
            Discussions
          </Link>
          <Link
            className={styles.resourceLink}
            href={repositoryLabelsPath(ownerLogin, repositoryName)}
          >
            Labels
          </Link>
          <Link
            className={styles.resourceLink}
            href={repositoryMilestonesPath(ownerLogin, repositoryName)}
          >
            Milestones
          </Link>
        </nav>
      )}
      <MiniAppRuntime
        key={routeKey}
        liffId={liffId}
        onReady={() => load()}
        onWait={clearAuthorizedState}
      />
      {detailMode && (
        <Link className="back-link" href={canonicalIssuesHref}>
          ← 返回 Issues
        </Link>
      )}
      {busy && <p role="status">處理中…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {pending && (
        <section>
          <p>上一筆操作結果尚未確認；重試會沿用同一 request identity。</p>
          <button
            type="button"
            disabled={busy || !data}
            onClick={() => void submit(pending.command)}
          >
            重試原操作
          </button>
        </section>
      )}
      {data && !detailMode && (
        <>
          {!data.repositories.length ? (
            <p>目前沒有可存取的儲存庫。</p>
          ) : (
            <>
              {canonicalRepository ? (
                <p>
                  儲存庫：{currentRepository?.name} · {currentRepository?.capability}
                </p>
              ) : (
                <label>
                  儲存庫
                  <select
                    value={selectedRepository}
                    disabled={busy || Boolean(pending)}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSelectedRepository(value);
                      void load(value);
                    }}
                  >
                    {data.repositories.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.capability}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <nav className="segmented-control" aria-label="Issue 檢視">
                {(["all", "mine", "created"] as const).map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    className="secondary"
                    aria-pressed={view === candidate}
                    onClick={() => {
                      setView(candidate);
                      void load(selectedRepository, candidate);
                    }}
                  >
                    {candidate === "all"
                      ? "全部 Issue"
                      : candidate === "mine"
                        ? "指派給我"
                        : "我建立的"}
                  </button>
                ))}
              </nav>
              {canWrite && (
                <button
                  type="button"
                  className="primary-cta"
                  onClick={() => setCreating((value) => !value)}
                >
                  {creating ? "收起建立表單" : "建立 Issue"}
                </button>
              )}
              {initialCreating && currentRepository && !canWrite && (
                <p className="empty-copy">
                  你目前只有 {currentRepository.capability} capability，不能在此 Repository 建立
                  Issue。
                </p>
              )}
              {creating && canWrite && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void submit({
                      requestId: crypto.randomUUID(),
                      repositoryId: selectedRepository,
                      action: "create",
                      title: String(form.get("title") ?? ""),
                      criteria: String(form.get("criteria") ?? ""),
                      assignee: String(form.get("assignee") ?? ""),
                    });
                  }}
                >
                  <label>
                    標題
                    <input name="title" required maxLength={80} />
                  </label>
                  <label>
                    完成條件
                    <textarea name="criteria" required maxLength={1000} />
                  </label>
                  <label>
                    承接人
                    <select name="assignee" required defaultValue="">
                      <option value="" disabled>
                        選擇儲存庫成員
                      </option>
                      {data.participants
                        .filter((participant) => participant.userId !== data.userId)
                        .map((participant) => (
                          <option key={participant.userId} value={participant.userId}>
                            {participant.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button disabled={busy || Boolean(pending)}>建立</button>
                </form>
              )}
              {!data.issues.length && <p className="empty-copy">目前沒有符合條件的 Issue。</p>}
              <ul className="issue-list">
                {data.issues.map((issue) => {
                  const issueRepository =
                    data.repositories.find((item) => item.id === issue.repositoryId) ??
                    currentRepository;
                  if (!issueRepository) return null;
                  return (
                    <li key={issue.id}>
                      <Link
                        className="issue-list-item"
                        href={repositoryIssuePath(
                          issueRepository.ownerLogin,
                          issueRepository.name,
                          issue.number,
                        )}
                      >
                        <strong>{issue.title}</strong>
                        <span className="status-badge">{statusLabel[issue.status]}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
      {data && current && detailMode && (
        <article className="detail-card">
          <h2>{current.title}</h2>
          <p>{statusLabel[current.status]}</p>
          <p>{current.criteria}</p>
          <p>
            建立者：{current.publisher}；承接人：{current.assignee}
          </p>
          {((current.assignee === data.userId && current.status === "active") ||
            (current.publisher === data.userId && current.status === "review")) && (
            <label>
              說明
              <textarea
                maxLength={1000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          )}
          {current.assignee === data.userId && current.status === "pending" && (
            <button type="button" onClick={() => operate("accept")}>
              {actionLabel.accept}
            </button>
          )}
          {current.assignee === data.userId && current.status === "active" && (
            <button type="button" disabled={!note.trim()} onClick={() => operate("report")}>
              {actionLabel.report}
            </button>
          )}
          {current.publisher === data.userId && current.status === "review" && (
            <>
              <button type="button" onClick={() => operate("approve")}>
                {actionLabel.approve}
              </button>
              <button type="button" disabled={!note.trim()} onClick={() => operate("reject")}>
                {actionLabel.reject}
              </button>
            </>
          )}
          <h3>Issue history</h3>
          <ol>
            {data.events
              .filter((event) => event.issueId === current.id)
              .map((event) => (
                <li key={event.version}>
                  {event.action === "create"
                    ? "建立 Issue"
                    : (actionLabel[event.action as IssueAction] ?? event.action)}
                  {event.note ? `：${event.note}` : ""}
                </li>
              ))}
          </ol>
        </article>
      )}
    </>
  );
}
