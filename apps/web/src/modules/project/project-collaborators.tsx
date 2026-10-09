"use client";

import type {
  ProjectCollaboratorInput,
  ProjectManagementCommand,
  ProjectManagementView,
} from "@line_bot_v1/project/contracts/management";
import type { ProjectAccessRole } from "@line_bot_v1/project/domain";
import { useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import styles from "./project-detail.module.css";
import {
  type ProjectDirectoryUser,
  ProjectRequestError,
  requestProjectActor,
  requestProjectUserByLogin,
} from "./project-requests";

function commandRole(role: ProjectAccessRole): ProjectCollaboratorInput["role"] {
  if (role === "READ") return "READER";
  if (role === "WRITE") return "WRITER";
  return "ADMIN";
}

function commandCollaborators(
  collaborators: ProjectManagementView["collaborators"],
): ProjectCollaboratorInput[] {
  return collaborators.map((item) =>
    item.kind === "USER"
      ? { userId: item.id, role: commandRole(item.role) }
      : { teamId: item.id, role: commandRole(item.role) },
  );
}

export default function ProjectCollaborators({
  liffId,
  projectId,
  actorUserId,
  data,
  users,
  busy,
  pending,
  send,
  onAccessChanged,
}: {
  liffId: string;
  projectId: string;
  actorUserId: string;
  data: ProjectManagementView;
  users: Readonly<Record<string, string>>;
  busy: boolean;
  pending: boolean;
  send: (command: ProjectManagementCommand, successMessage: string) => void;
  onAccessChanged: () => void;
}) {
  const [login, setLogin] = useState("");
  const [role, setRole] = useState<"READER" | "WRITER" | "ADMIN">("WRITER");
  const [candidate, setCandidate] = useState<ProjectDirectoryUser | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState("");

  async function findCollaborator() {
    if (!login.trim() || lookupBusy || busy || pending) return;
    setLookupBusy(true);
    setLookupError("");
    setCandidate(null);
    try {
      const token = await liffClient.ensureSession(liffId);
      if (!token) throw new ProjectRequestError("請完成 LINE 登入後重試。", 401);
      const actor = await requestProjectActor(token);
      if (actor.id !== actorUserId) {
        throw new ProjectRequestError("LINE 使用者已切換，請重新讀取 Project。", 403);
      }
      setCandidate(await requestProjectUserByLogin(token, projectId, login));
    } catch (cause) {
      if (cause instanceof ProjectRequestError && (cause.status === 401 || cause.status === 403)) {
        onAccessChanged();
      }
      setLookupError(cause instanceof Error ? cause.message : "使用者查詢失敗。");
    } finally {
      setLookupBusy(false);
    }
  }

  function updateUser(userId: string, nextRole: ProjectCollaboratorInput["role"]) {
    const next = commandCollaborators(data.collaborators);
    const index = next.findIndex((item) => item.userId === userId);
    if (index < 0) {
      if (nextRole === "NONE") return;
      next.push({ userId, role: nextRole });
    } else {
      next[index] = { userId, role: nextRole };
    }
    send(
      {
        action: "update-collaborators",
        requestId: crypto.randomUUID(),
        projectId: data.project.id,
        expectedVersion: data.project.version,
        collaborators: next,
      },
      nextRole === "NONE" ? "協作者已移除。" : "協作者權限已更新。",
    );
    setCandidate(null);
    setLogin("");
  }

  function updateTeam(teamId: string, nextRole: ProjectCollaboratorInput["role"]) {
    const next = commandCollaborators(data.collaborators);
    const index = next.findIndex((item) => item.teamId === teamId);
    if (index < 0) return;
    next[index] = { teamId, role: nextRole };
    send(
      {
        action: "update-collaborators",
        requestId: crypto.randomUUID(),
        projectId: data.project.id,
        expectedVersion: data.project.version,
        collaborators: next,
      },
      nextRole === "NONE" ? "Team 協作者已移除。" : "Team 協作者權限已更新。",
    );
  }

  return (
    <section className="crud-detail">
      <div className="crud-section-head">
        <div>
          <h2>協作者</h2>
          <p>直接 User 權限屬於 Project；Team 成員與 Repository access 不會因此改變。</p>
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void findCollaborator();
        }}
      >
        <label>
          User 登入名稱
          <input
            autoCapitalize="none"
            autoCorrect="off"
            maxLength={39}
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            disabled={busy || pending || lookupBusy}
            placeholder="例如 alex"
          />
        </label>
        <button disabled={busy || pending || lookupBusy || !login.trim()}>
          {lookupBusy ? "查詢中…" : "查找 User"}
        </button>
      </form>
      {lookupError && <p role="alert">{lookupError}</p>}
      {candidate && (
        <article>
          <strong>@{candidate.login}</strong>
          {data.collaborators.some((item) => item.kind === "USER" && item.id === candidate.id) ? (
            <p>此 User 已是 Project 協作者，可在下方調整權限。</p>
          ) : candidate.id === actorUserId ? (
            <p>這是目前登入的 User，不需要額外加入協作者。</p>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                updateUser(candidate.id, role);
              }}
            >
              <label>
                Project 權限
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as typeof role)}
                  disabled={busy || pending}
                >
                  <option value="READER">讀取</option>
                  <option value="WRITER">編輯工作</option>
                  <option value="ADMIN">管理 Project</option>
                </select>
              </label>
              <button disabled={busy || pending}>新增協作者</button>
            </form>
          )}
        </article>
      )}
      {data.collaborators.length === 0 ? (
        <p className="empty-copy">目前只有 Project owner 可以存取。</p>
      ) : (
        <ul className="crud-entity-list">
          {data.collaborators.map((item) => (
            <li key={`${item.kind}:${item.id}`}>
              <article className="crud-entity-item">
                <span>
                  <strong>
                    {item.kind === "USER"
                      ? users[item.id]
                        ? `@${users[item.id]}`
                        : "User collaborator"
                      : "Organization Team"}
                  </strong>
                  <small>
                    {item.kind === "TEAM"
                      ? `Team ID ${item.id}`
                      : `${item.role}${users[item.id] ? "" : ` · ${item.id.slice(0, 8)}`}`}
                  </small>
                </span>
                <span className={styles.collaboratorActions}>
                  <select
                    aria-label={`${item.kind === "USER" ? (users[item.id] ?? "User") : "Team"} 權限`}
                    value={commandRole(item.role)}
                    disabled={busy || pending}
                    onChange={(event) => {
                      const nextRole = event.target.value as ProjectCollaboratorInput["role"];
                      if (item.kind === "USER") updateUser(item.id, nextRole);
                      else updateTeam(item.id, nextRole);
                    }}
                  >
                    <option value="READER">讀取</option>
                    <option value="WRITER">編輯工作</option>
                    <option value="ADMIN">管理 Project</option>
                  </select>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy || pending}
                    onClick={() =>
                      item.kind === "USER"
                        ? updateUser(item.id, "NONE")
                        : updateTeam(item.id, "NONE")
                    }
                  >
                    移除
                  </button>
                </span>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
