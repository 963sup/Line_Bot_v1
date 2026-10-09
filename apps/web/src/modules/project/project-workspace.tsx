"use client";

import {
  projectProgressOptions,
  suggestedProgressName,
} from "@line_bot_v1/project/application/progress";
import type {
  ProjectManagementCommand,
  ProjectManagementView,
} from "@line_bot_v1/project/contracts/management";
import { useState } from "react";
import styles from "./project-detail.module.css";

function itemTitle(item: ProjectManagementView["items"][number]) {
  return item.kind === "DRAFT_ISSUE"
    ? item.draft?.title || "未命名草稿"
    : item.issue
      ? `#${item.issue.number} ${item.issue.title}`
      : "目前無法顯示來源工作項目";
}

function itemBody(item: ProjectManagementView["items"][number]) {
  return item.kind === "DRAFT_ISSUE" ? item.draft?.body || "" : "";
}

function displayUser(id: string, actorUserId: string, users: Readonly<Record<string, string>>) {
  if (id === actorUserId) return `@${users[id] ?? "你"}`;
  return users[id] ? `@${users[id]}` : `User ${id.slice(0, 8)}`;
}

export default function ProjectWorkspace({
  data,
  actorUserId,
  users,
  busy,
  pending,
  send,
}: {
  data: ProjectManagementView;
  actorUserId: string;
  users: Readonly<Record<string, string>>;
  busy: boolean;
  pending: boolean;
  send: (command: ProjectManagementCommand, successMessage: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<readonly string[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const activeItems = data.items.filter((item) => !item.archived);
  const archivedItems = data.items.filter((item) => item.archived);
  const canWrite = data.role === "WRITE" || data.role === "ADMIN";
  const assignableUsers = [
    ...new Set([
      ...(actorUserId ? [actorUserId] : []),
      ...data.collaborators.filter((item) => item.kind === "USER").map((item) => item.id),
    ]),
  ];
  const progressField =
    data.fields.find(
      (field) =>
        field.dataType === "SINGLE_SELECT" &&
        (field.name.trim().toLocaleLowerCase() === "status" ||
          field.name.trim().toLocaleLowerCase().startsWith("工作進度")),
    ) ?? null;

  function addDraft() {
    if (!title.trim() || data.project.closed) return;
    send(
      {
        action: "add-draft-item",
        requestId: crypto.randomUUID(),
        projectId: data.project.id,
        expectedVersion: data.project.version,
        title: title.trim(),
        body,
        assigneeIds,
      },
      "工作項目已新增。",
    );
    setTitle("");
    setBody("");
    setAssigneeIds([]);
  }

  function updateDraft(item: ProjectManagementView["items"][number], form: HTMLFormElement) {
    if (item.kind !== "DRAFT_ISSUE" || !item.draft || data.project.closed) return;
    const values = new FormData(form);
    const nextAssigneeIds = values.getAll("assigneeIds").filter((value): value is string => {
      return typeof value === "string" && value.length > 0;
    });
    send(
      {
        action: "update-draft-item",
        requestId: crypto.randomUUID(),
        projectId: data.project.id,
        expectedVersion: data.project.version,
        itemId: item.id,
        draftVersion: item.draft.version,
        title: String(values.get("title") ?? "").trim(),
        body: String(values.get("body") ?? ""),
        assigneeIds: nextAssigneeIds,
      },
      "工作項目已更新。",
    );
  }

  function setProgress(itemId: string, fieldId: string, optionId: string) {
    const base = {
      requestId: crypto.randomUUID(),
      projectId: data.project.id,
      expectedVersion: data.project.version,
    };
    if (!optionId) {
      send({ action: "clear-field-value", ...base, itemId, fieldId }, "工作進度已清除。");
      return;
    }
    send(
      {
        action: "set-field-value",
        ...base,
        itemId,
        fieldId,
        value: { type: "SINGLE_SELECT", optionId },
      },
      "工作進度已更新。",
    );
  }

  function createProgressField() {
    send(
      {
        action: "create-field",
        requestId: crypto.randomUUID(),
        projectId: data.project.id,
        expectedVersion: data.project.version,
        name: suggestedProgressName(data.fields),
        dataType: "SINGLE_SELECT",
        options: projectProgressOptions,
        iterations: [],
      },
      "工作進度欄位已建立。",
    );
  }

  return (
    <>
      <section className="crud-detail">
        <div className="crud-section-head">
          <div>
            <h2>工作進度</h2>
            <p>Project 欄位只記錄此 Project 的規劃狀態，不會改寫來源 Issue。</p>
          </div>
        </div>
        {!progressField && canWrite && !data.project.closed && (
          <button type="button" disabled={busy || pending} onClick={createProgressField}>
            建立工作進度欄位
          </button>
        )}
        {!progressField && !canWrite && (
          <p className="empty-copy">此 Project 尚未設定單選工作進度欄位。</p>
        )}
        {progressField && activeItems.length === 0 && (
          <p className="empty-copy">先新增工作項目，再設定各項進度。</p>
        )}
        {progressField && activeItems.length > 0 && (
          <ul className="crud-entity-list">
            {activeItems.map((item) => {
              const value = data.fieldValues.find(
                (entry) => entry.itemId === item.id && entry.fieldId === progressField.id,
              );
              const selectedOptionId =
                value?.value.type === "SINGLE_SELECT" ? value.value.optionId : "";
              return (
                <li key={item.id}>
                  <label className={styles.progressRow}>
                    <span>{itemTitle(item)}</span>
                    <select
                      aria-label={`${itemTitle(item)} 工作進度`}
                      value={selectedOptionId}
                      disabled={!canWrite || busy || pending || data.project.closed}
                      onChange={(event) =>
                        setProgress(item.id, progressField.id, event.target.value)
                      }
                    >
                      <option value="">未設定</option>
                      {progressField.options.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="crud-detail">
        <div className="crud-section-head">
          <div>
            <h2>工作項目</h2>
            <p>草稿只存在這個 Project，不會建立或修改 Repository Issue。</p>
          </div>
          {archivedItems.length > 0 && (
            <button
              type="button"
              className="secondary"
              aria-expanded={showArchived}
              onClick={() => setShowArchived((value) => !value)}
            >
              {showArchived ? "隱藏" : "顯示"}封存項目（{archivedItems.length}）
            </button>
          )}
        </div>

        {canWrite && !data.project.closed && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              addDraft();
            }}
          >
            <label>
              工作項目
              <input
                required
                maxLength={160}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={busy || pending}
                placeholder="記下要完成的事情"
              />
            </label>
            <label>
              說明
              <textarea
                maxLength={20_000}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                disabled={busy || pending}
                rows={4}
                placeholder="補充背景或完成條件（選填）"
              />
            </label>
            {assignableUsers.length > 0 && (
              <label>
                指派給 Project User 協作者
                <select
                  multiple
                  value={assigneeIds}
                  onChange={(event) =>
                    setAssigneeIds(
                      [...event.currentTarget.selectedOptions].map((option) => option.value),
                    )
                  }
                  disabled={busy || pending}
                >
                  {assignableUsers.map((id) => (
                    <option key={id} value={id}>
                      {displayUser(id, actorUserId, users)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button disabled={busy || pending || !title.trim()}>新增工作項目</button>
          </form>
        )}

        {activeItems.length === 0 ? (
          <p className="empty-copy">這個 Project 還沒有工作項目。</p>
        ) : (
          <ul className="crud-entity-list">
            {activeItems.map((item) => (
              <li key={item.id}>
                <article className={styles.workItem}>
                  <div className={styles.workItemSummary}>
                    <span>
                      <strong>{itemTitle(item)}</strong>
                      {item.kind === "DRAFT_ISSUE" && <small>Project 草稿</small>}
                      {itemBody(item) && (
                        <small className={styles.itemBody}>{itemBody(item)}</small>
                      )}
                      {item.draft?.assigneeIds.length ? (
                        <small>
                          指派給：
                          {item.draft.assigneeIds
                            .map((id) => displayUser(id, actorUserId, users))
                            .join("、")}
                        </small>
                      ) : null}
                    </span>
                    {canWrite && !data.project.closed && (
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy || pending}
                        onClick={() =>
                          send(
                            {
                              action: "archive-item",
                              requestId: crypto.randomUUID(),
                              projectId: data.project.id,
                              expectedVersion: data.project.version,
                              itemId: item.id,
                              itemVersion: item.version,
                            },
                            "工作項目已封存。來源 Issue 未變更。",
                          )
                        }
                      >
                        封存
                      </button>
                    )}
                  </div>
                  {canWrite &&
                    !data.project.closed &&
                    item.kind === "DRAFT_ISSUE" &&
                    item.draft && (
                      <details>
                        <summary>編輯 Project 草稿</summary>
                        <form
                          key={`${item.id}:${item.draft.version}`}
                          onSubmit={(event) => {
                            event.preventDefault();
                            updateDraft(item, event.currentTarget);
                          }}
                        >
                          <label>
                            工作項目
                            <input
                              name="title"
                              required
                              maxLength={160}
                              defaultValue={item.draft.title ?? ""}
                              disabled={busy || pending}
                            />
                          </label>
                          <label>
                            說明
                            <textarea
                              name="body"
                              maxLength={20_000}
                              rows={3}
                              defaultValue={item.draft.body ?? ""}
                              disabled={busy || pending}
                            />
                          </label>
                          <label>
                            指派給 Project User 協作者
                            <select
                              name="assigneeIds"
                              multiple
                              defaultValue={item.draft.assigneeIds}
                              disabled={busy || pending}
                            >
                              {[...new Set([...assignableUsers, ...item.draft.assigneeIds])].map(
                                (id) => (
                                  <option key={id} value={id}>
                                    {displayUser(id, actorUserId, users)}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                          <button disabled={busy || pending}>儲存草稿</button>
                        </form>
                      </details>
                    )}
                </article>
              </li>
            ))}
          </ul>
        )}

        {showArchived && archivedItems.length > 0 && (
          <ul className="crud-entity-list" aria-label="封存的工作項目">
            {archivedItems.map((item) => (
              <li key={item.id}>
                <article className="crud-entity-item">
                  <span>
                    <strong>{itemTitle(item)}</strong>
                    <small>已封存；來源 Issue 狀態不變</small>
                  </span>
                  {canWrite && !data.project.closed && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy || pending}
                      onClick={() =>
                        send(
                          {
                            action: "unarchive-item",
                            requestId: crypto.randomUUID(),
                            projectId: data.project.id,
                            expectedVersion: data.project.version,
                            itemId: item.id,
                            itemVersion: item.version,
                          },
                          "工作項目已還原。",
                        )
                      }
                    >
                      還原
                    </button>
                  )}
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
