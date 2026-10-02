"use client";

import type { IssueCommand, IssueSnapshot } from "@line_bot_v1/issue/application/ports/issues";
import {
  canIssueRepositoryOperation,
  type IssueAction,
  type IssueClosedStateReason,
  type IssueWorkflowStatus,
} from "@line_bot_v1/issue/domain";
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
import { postIssueCommand, requestIssueSnapshot } from "./issue-requests";
import {
  repositoryDiscussionsPath,
  repositoryIssuePath,
  repositoryIssuesPath,
  repositoryLabelsPath,
  repositoryMilestonesPath,
  repositorySettingsPath,
} from "./resource-navigation";
import styles from "./resource-navigation.module.css";

const workflowStatusLabel: Record<IssueWorkflowStatus, string> = {
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

  async function load(nextRepository = selectedRepository, nextView = view) {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const token = await liffClient.session(liffId);
      if (!token || ticket !== generation.current) return;
      const snapshot = await requestIssueSnapshot({
        token,
        issueNumber,
        repositoryId,
        ownerLogin,
        repositoryName,
        repository: nextRepository,
        view: nextView,
      });
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
      const { response, value } = await postIssueCommand(token, command);
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
      setData(
        await requestIssueSnapshot({
          token: tokenAfter,
          issueNumber,
          repositoryId,
          ownerLogin,
          repositoryName,
          repository: command.repositoryId,
          view,
        }),
      );
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
  const canOpenIssue = currentRepository
    ? canIssueRepositoryOperation(currentRepository.permissions, "open")
    : false;
  const canAssignIssue = currentRepository
    ? canIssueRepositoryOperation(currentRepository.permissions, "assign")
    : false;
  const canEditIssue = currentRepository
    ? canIssueRepositoryOperation(currentRepository.permissions, "edit")
    : false;
  const canCloseIssue = currentRepository
    ? canIssueRepositoryOperation(currentRepository.permissions, "close")
    : false;
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
        description="Issue state 與本地工作流程分開管理；儲存庫提供範圍與存取，Project 只引用工作。"
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
          <Link
            className={styles.resourceLink}
            href={repositorySettingsPath(ownerLogin, repositoryName)}
          >
            Settings
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
                  儲存庫：{currentRepository?.name} · {currentRepository?.permissions.join(", ")}
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
                        {item.name} · {item.permissions.join(", ")}
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
              {canOpenIssue && (
                <button
                  type="button"
                  className="primary-cta"
                  onClick={() => setCreating((value) => !value)}
                >
                  {creating ? "收起建立表單" : "建立 Issue"}
                </button>
              )}
              {initialCreating && currentRepository && !canOpenIssue && (
                <p className="empty-copy">
                  目前的 Repository permission 與 Issue 建立政策不允許在此 Repository 建立 Issue。
                </p>
              )}
              {creating && canOpenIssue && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void submit({
                      requestId: crypto.randomUUID(),
                      repositoryId: selectedRepository,
                      action: "create",
                      title: String(form.get("title") ?? ""),
                      body: String(form.get("body") ?? ""),
                      criteria: String(form.get("criteria") ?? ""),
                      assigneeIds: canAssignIssue
                        ? form.getAll("assignees").map((value) => String(value))
                        : [],
                    });
                  }}
                >
                  <label>
                    標題
                    <input name="title" required maxLength={80} />
                  </label>
                  <label>
                    Issue body
                    <textarea name="body" maxLength={10000} />
                  </label>
                  <label>
                    本地驗收條件
                    <textarea name="criteria" maxLength={1000} />
                  </label>
                  {canAssignIssue && (
                    <label>
                      Assignees（可多選）
                      <select
                        name="assignees"
                        multiple
                        size={Math.max(1, Math.min(6, data.participants.length))}
                      >
                        {data.participants.map((participant) => (
                          <option key={participant.userId} value={participant.userId}>
                            {participant.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
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
                        <span className="status-badge">
                          {workflowStatusLabel[issue.workflowStatus]}
                        </span>
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
          <p>
            Issue state：{current.state}
            {current.stateReason ? ` · ${current.stateReason}` : ""}
          </p>
          <p>本地工作流程：{workflowStatusLabel[current.workflowStatus]}</p>
          {current.body ? <p>{current.body}</p> : <p className="empty-copy">Issue body 為空。</p>}
          {current.criteria ? (
            <section>
              <h3>本地驗收條件</h3>
              <p>{current.criteria}</p>
            </section>
          ) : (
            <p className="empty-copy">未設定本地驗收條件。</p>
          )}
          <p>
            建立者：{current.publisher}；Assignees：
            {current.assignees.length ? current.assignees.join(", ") : "未指派"}
          </p>

          {current.state === "OPEN" &&
            ((current.assignees.includes(data.userId) && current.workflowStatus === "active") ||
              (current.publisher === data.userId && current.workflowStatus === "review")) && (
              <label>
                本地工作流程說明
                <textarea
                  maxLength={1000}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
            )}
          {current.state === "OPEN" &&
            current.assignees.includes(data.userId) &&
            current.workflowStatus === "pending" && (
              <button
                type="button"
                disabled={busy || Boolean(pending)}
                onClick={() => operate("accept")}
              >
                {actionLabel.accept}
              </button>
            )}
          {current.state === "OPEN" &&
            current.assignees.includes(data.userId) &&
            current.workflowStatus === "active" && (
              <button
                type="button"
                disabled={busy || Boolean(pending) || !note.trim()}
                onClick={() => operate("report")}
              >
                {actionLabel.report}
              </button>
            )}
          {current.state === "OPEN" &&
            current.publisher === data.userId &&
            current.workflowStatus === "review" && (
              <>
                <button
                  type="button"
                  disabled={busy || Boolean(pending)}
                  onClick={() => operate("approve")}
                >
                  {actionLabel.approve}
                </button>
                <button
                  type="button"
                  disabled={busy || Boolean(pending) || !note.trim()}
                  onClick={() => operate("reject")}
                >
                  {actionLabel.reject}
                </button>
              </>
            )}

          {canEditIssue && (
            <form
              key={"edit-" + current.version}
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void submit({
                  requestId: crypto.randomUUID(),
                  repositoryId: current.repositoryId,
                  issueId: current.id,
                  expectedVersion: current.version,
                  action: "edit",
                  title: String(form.get("title") ?? ""),
                  body: String(form.get("body") ?? ""),
                  criteria: String(form.get("criteria") ?? ""),
                });
              }}
            >
              <h3>編輯 Issue 內容</h3>
              <label>
                標題
                <input name="title" required maxLength={80} defaultValue={current.title} />
              </label>
              <label>
                Issue body
                <textarea name="body" maxLength={10000} defaultValue={current.body} />
              </label>
              <label>
                本地驗收條件
                <textarea name="criteria" maxLength={1000} defaultValue={current.criteria} />
              </label>
              <button type="submit" disabled={busy || Boolean(pending)}>
                儲存內容
              </button>
            </form>
          )}

          {canAssignIssue && (
            <section>
              <h3>Assignees</h3>
              {data.participants.some(
                (participant) => !current.assignees.includes(participant.userId),
              ) && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const assigneeIds = new FormData(event.currentTarget)
                      .getAll("assigneeIds")
                      .map((value) => String(value));
                    if (!assigneeIds.length) return;
                    void submit({
                      requestId: crypto.randomUUID(),
                      repositoryId: current.repositoryId,
                      issueId: current.id,
                      expectedVersion: current.version,
                      action: "add-assignees",
                      assigneeIds,
                    });
                  }}
                >
                  <label>
                    新增 Assignees
                    <select
                      name="assigneeIds"
                      multiple
                      size={Math.max(1, Math.min(6, data.participants.length))}
                    >
                      {data.participants
                        .filter((participant) => !current.assignees.includes(participant.userId))
                        .map((participant) => (
                          <option key={participant.userId} value={participant.userId}>
                            {participant.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button type="submit" disabled={busy || Boolean(pending)}>
                    新增指派
                  </button>
                </form>
              )}
              {current.assignees.map((assigneeId) => (
                <p key={assigneeId}>
                  {assigneeId}{" "}
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy || Boolean(pending)}
                    onClick={() =>
                      void submit({
                        requestId: crypto.randomUUID(),
                        repositoryId: current.repositoryId,
                        issueId: current.id,
                        expectedVersion: current.version,
                        action: "remove-assignees",
                        assigneeIds: [assigneeId],
                      })
                    }
                  >
                    移除指派
                  </button>
                </p>
              ))}
            </section>
          )}

          {canCloseIssue && (
            <section>
              <h3>Issue state</h3>
              {current.state === "OPEN" ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const reason = String(form.get("stateReason") ?? "");
                    const stateReason: IssueClosedStateReason | null =
                      reason === "COMPLETED" || reason === "DUPLICATE" || reason === "NOT_PLANNED"
                        ? reason
                        : null;
                    void submit({
                      requestId: crypto.randomUUID(),
                      repositoryId: current.repositoryId,
                      issueId: current.id,
                      expectedVersion: current.version,
                      action: "close",
                      stateReason,
                      note: String(form.get("note") ?? ""),
                    });
                  }}
                >
                  <label>
                    Close reason
                    <select name="stateReason" defaultValue="">
                      <option value="">未指定</option>
                      <option value="COMPLETED">COMPLETED</option>
                      <option value="DUPLICATE">DUPLICATE</option>
                      <option value="NOT_PLANNED">NOT_PLANNED</option>
                    </select>
                  </label>
                  <label>
                    說明
                    <textarea name="note" maxLength={1000} />
                  </label>
                  <button type="submit" disabled={busy || Boolean(pending)}>
                    Close Issue
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  disabled={busy || Boolean(pending)}
                  onClick={() =>
                    void submit({
                      requestId: crypto.randomUUID(),
                      repositoryId: current.repositoryId,
                      issueId: current.id,
                      expectedVersion: current.version,
                      action: "reopen",
                      note: "",
                    })
                  }
                >
                  Reopen Issue
                </button>
              )}
            </section>
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
