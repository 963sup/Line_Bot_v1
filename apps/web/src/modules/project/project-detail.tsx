"use client";

import type {
  ProjectManagementCommand,
  ProjectManagementView,
} from "@line_bot_v1/project/contracts/management";
import { useCallback, useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import ProjectCollaborators from "./project-collaborators";
import styles from "./project-detail.module.css";
import {
  type ProjectDirectoryUser,
  ProjectRequestError,
  postProjectCommand,
  requestProjectActor,
  requestProjectUsers,
  requestProjectView,
} from "./project-requests";
import ProjectSettings from "./project-settings";
import ProjectWorkspace from "./project-workspace";

type PendingOperation = Readonly<{
  actorUserId: string;
  command: ProjectManagementCommand;
}>;

const retryableUiActions = new Set<ProjectManagementCommand["action"]>([
  "update-project",
  "close-project",
  "reopen-project",
  "update-collaborators",
  "add-draft-item",
  "update-draft-item",
  "archive-item",
  "unarchive-item",
  "create-field",
  "set-field-value",
  "clear-field-value",
]);

function pendingKey(projectId: string, actorUserId: string) {
  return `project-command:${projectId}:${actorUserId}`;
}

function clearPending(projectId: string, actorUserId: string) {
  try {
    sessionStorage.removeItem(pendingKey(projectId, actorUserId));
  } catch {
    // A failed cleanup must not replace the server's replay record.
  }
}

function readPending(projectId: string, actorUserId: string): PendingOperation | null {
  try {
    const raw = sessionStorage.getItem(pendingKey(projectId, actorUserId));
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingOperation;
    const command = value?.command;
    if (
      !value ||
      typeof value !== "object" ||
      !command ||
      typeof command !== "object" ||
      value.actorUserId !== actorUserId ||
      !("projectId" in command) ||
      command.projectId !== projectId ||
      typeof command.requestId !== "string" ||
      !Number.isSafeInteger(command.expectedVersion) ||
      !retryableUiActions.has(command.action)
    ) {
      clearPending(projectId, actorUserId);
      return null;
    }
    return value;
  } catch {
    clearPending(projectId, actorUserId);
    return null;
  }
}

function savePending(operation: PendingOperation) {
  const { command } = operation;
  if (!("projectId" in command)) {
    throw new ProjectRequestError("Project 操作格式不正確，尚未送出。", 400);
  }
  try {
    sessionStorage.setItem(
      pendingKey(command.projectId, operation.actorUserId),
      JSON.stringify(operation),
    );
  } catch {
    throw new ProjectRequestError("無法保存安全重試資訊；這次操作尚未送出。", 503);
  }
}

function pendingLabel(action: ProjectManagementCommand["action"]) {
  if (action === "add-draft-item") return "新增工作項目";
  if (action === "update-draft-item") return "編輯工作項目";
  if (action === "update-collaborators") return "更新協作者";
  if (action === "create-field") return "建立進度欄位";
  if (action === "set-field-value" || action === "clear-field-value") return "更新工作進度";
  if (action === "archive-item" || action === "unarchive-item") return "更新工作項目封存狀態";
  if (action === "close-project" || action === "reopen-project") return "更新 Project 狀態";
  return "更新 Project";
}

export default function ProjectDetail({
  liffId,
  projectId,
}: {
  liffId: string;
  projectId: string;
}) {
  const [data, setData] = useState<ProjectManagementView | null>(null);
  const [actorUserId, setActorUserId] = useState("");
  const [users, setUsers] = useState<Readonly<Record<string, string>>>({});
  const [pending, setPending] = useState<PendingOperation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const locked = useRef(false);

  const clear = useCallback(() => {
    generation.current++;
    setData(null);
    setActorUserId("");
    setUsers({});
    setPending(null);
    setBusy(false);
    setError("");
    setNotice("");
  }, []);

  const load = useCallback(
    async (preserveNotice = false) => {
      if (locked.current) return;
      const ticket = ++generation.current;
      setBusy(true);
      setError("");
      if (!preserveNotice) setNotice("");
      try {
        const token = await liffClient.ensureSession(liffId);
        if (!token) throw new ProjectRequestError("請完成 LINE 登入後重試。", 401);
        const [actor, snapshot] = await Promise.all([
          requestProjectActor(token),
          requestProjectView(token, projectId),
        ]);
        if (ticket !== generation.current) return;

        const userIds = [
          ...new Set([
            actor.id,
            ...(snapshot.project.creator ? [snapshot.project.creator] : []),
            ...snapshot.collaborators.filter((item) => item.kind === "USER").map((item) => item.id),
            ...snapshot.items.flatMap((item) => item.draft?.assigneeIds ?? []),
          ]),
        ];
        const batches: string[][] = [];
        for (let index = 0; index < userIds.length; index += 100) {
          batches.push(userIds.slice(index, index + 100));
        }
        let directoryUsers: readonly ProjectDirectoryUser[] = [];
        try {
          const results = await Promise.all(
            batches.map((batch) => requestProjectUsers(token, projectId, batch)),
          );
          directoryUsers = results.flat();
        } catch (cause) {
          if (
            cause instanceof ProjectRequestError &&
            (cause.status === 401 || cause.status === 403)
          ) {
            throw cause;
          }
          // The authorized Project facts remain useful while a profile label is unavailable.
        }
        if (ticket !== generation.current) return;

        setActorUserId(actor.id);
        setData(snapshot);
        setUsers(
          Object.fromEntries(
            directoryUsers.flatMap((user) => (user.login ? [[user.id, user.login]] : [])),
          ),
        );
        setPending(readPending(projectId, actor.id));
      } catch (cause) {
        if (ticket === generation.current) {
          setData(null);
          setActorUserId("");
          setUsers({});
          setPending(null);
          setError(cause instanceof Error ? cause.message : "Project 讀取失敗。");
        }
      } finally {
        if (ticket === generation.current) setBusy(false);
      }
    },
    [liffId, projectId],
  );

  useEffect(() => {
    const visibility = () => {
      if (document.visibilityState === "hidden") clear();
      else void load();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      generation.current++;
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [clear, load]);

  async function execute(operation: PendingOperation, successMessage = "Project 已更新。") {
    if (locked.current) return;
    locked.current = true;
    const ticket = generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    let succeeded = false;
    let refresh = false;
    let preserveRefreshNotice = false;
    try {
      const token = await liffClient.ensureSession(liffId);
      if (!token) throw new ProjectRequestError("請完成 LINE 登入後重試。", 401);
      const actor = await requestProjectActor(token);
      if (ticket !== generation.current) return;
      if (actor.id !== operation.actorUserId) {
        throw new ProjectRequestError("LINE 使用者已切換，請重新讀取 Project。", 403);
      }
      const receipt = await postProjectCommand(token, operation.command);
      if (ticket !== generation.current) {
        succeeded = true;
        refresh = true;
        return;
      }
      if (
        receipt.requestId !== operation.command.requestId ||
        receipt.projectId !== projectId ||
        receipt.action !== operation.command.action ||
        !Number.isSafeInteger(receipt.version)
      ) {
        throw new ProjectRequestError("Project 操作回執不完整，請重試原操作。", 503);
      }
      clearPending(projectId, operation.actorUserId);
      setPending(null);
      setNotice(successMessage);
      succeeded = true;
      refresh = true;
    } catch (cause) {
      if (ticket !== generation.current) return;
      const status = cause instanceof ProjectRequestError ? cause.status : 503;
      if (status < 500 && status !== 429) {
        clearPending(projectId, operation.actorUserId);
        setPending(null);
      }
      if (status === 401 || status === 403 || status === 409) refresh = true;
      if (status === 409) {
        preserveRefreshNotice = true;
        setNotice("Project 已有新變更，已重新讀取；請確認目前內容後再操作。");
      }
      setError(
        cause instanceof Error ? cause.message : "操作結果尚待確認；重試會沿用原 requestId。",
      );
    } finally {
      locked.current = false;
      if (ticket === generation.current) setBusy(false);
      if (refresh && document.visibilityState !== "hidden") {
        void load(succeeded || preserveRefreshNotice);
      }
    }
  }

  function send(command: ProjectManagementCommand, successMessage: string) {
    if (!actorUserId || !data || pending || busy || locked.current) return;
    const operation = { actorUserId, command };
    try {
      savePending(operation);
      setPending(operation);
      void execute(operation, successMessage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作尚未送出。");
    }
  }

  const canManage = data?.role === "ADMIN";
  const pendingAction = pending?.command.action;

  return (
    <div className="crud-manager resource-workspace">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      {busy && <p role="status">正在讀取或保存 Project…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!busy && error && (
        <button type="button" className="secondary" onClick={() => void load()}>
          重新載入
        </button>
      )}
      {pending && !busy && (
        <section className="crud-guidance">
          <p>
            {pendingLabel(pendingAction ?? "update-project")}結果尚待確認；重試會沿用原 requestId。
          </p>
          <button type="button" onClick={() => void execute(pending)}>
            重試原操作
          </button>
        </section>
      )}
      {data && (
        <>
          <section className="crud-detail">
            <p className="eyebrow">
              {data.project.ownerKind === "USER" ? "Personal Project" : "Organization Project"}
              {data.project.number === null ? "" : ` · #${data.project.number}`}
            </p>
            <h2>{data.project.title}</h2>
            <p>
              {data.project.public ? "公開" : "私人"} · {data.project.closed ? "已關閉" : "開啟"} ·
              你的角色：{data.role}
            </p>
            {data.project.shortDescription && <p>{data.project.shortDescription}</p>}
            {data.project.readme && <p className={styles.projectReadme}>{data.project.readme}</p>}
            <p className="crud-lifecycle-note">
              Repository 權限不會自動成為 Project 權限；Project 工作項目與來源 Issue 分開管理。
            </p>
          </section>

          {canManage && (
            <ProjectSettings data={data} busy={busy} pending={Boolean(pending)} send={send} />
          )}
          {canManage && (
            <ProjectCollaborators
              liffId={liffId}
              projectId={projectId}
              actorUserId={actorUserId}
              data={data}
              users={users}
              busy={busy}
              pending={Boolean(pending)}
              send={send}
              onAccessChanged={() => void load()}
            />
          )}
          <ProjectWorkspace
            data={data}
            actorUserId={actorUserId}
            users={users}
            busy={busy}
            pending={Boolean(pending)}
            send={send}
          />
        </>
      )}
    </div>
  );
}
