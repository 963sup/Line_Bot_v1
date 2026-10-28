"use client";

import type {
  ProjectManagementCommand,
  ProjectManagementView,
} from "@line_bot_v1/project/contracts/management";
import { useCallback, useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import ProjectImportFields, { type ImportIssues, importLabels } from "./project-import-fields";
import {
  type ProjectRepositoryOption,
  requestProjectActor,
  requestProjectRepositories,
} from "./project-requests";

export default function ProjectRepositoryImports({
  data,
  liffId,
  actorUserId,
  busy,
  pending,
  send,
}: {
  data: ProjectManagementView;
  liffId: string;
  actorUserId: string;
  busy: boolean;
  pending: boolean;
  send: (command: ProjectManagementCommand, successMessage: string) => void;
}) {
  const [repositories, setRepositories] = useState<readonly ProjectRepositoryOption[] | null>(null);
  const [repositoryId, setRepositoryId] = useState("");
  const [state, setState] = useState<ImportIssues>("OPEN");
  const [error, setError] = useState("");
  const generation = useRef(0);
  const canManage = data.role === "ADMIN" && !data.project.closed;
  const loadRepositories = useCallback(async () => {
    const ticket = ++generation.current;
    setRepositories(null);
    setRepositoryId("");
    setError("");
    if (!canManage) return;
    try {
      const token = await liffClient.ensureSession(liffId);
      if (!token) throw new Error("請完成 LINE 登入後重試。");
      const actor = await requestProjectActor(token);
      if (actor.id !== actorUserId) throw new Error("使用者已切換，請重新讀取 Project。");
      const choices = await requestProjectRepositories(token);
      if (ticket === generation.current) setRepositories(choices);
    } catch (cause) {
      if (ticket === generation.current)
        setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [liffId, actorUserId, canManage]);
  useEffect(() => {
    void loadRepositories();
    return () => {
      generation.current++;
    };
  }, [loadRepositories]);
  const rules = data.repositoryImports ?? [];
  if (!canManage && !rules.length) return null;
  return (
    <section className="crud-detail">
      <h2>儲存庫匯入</h2>
      {rules.length > 0 && (
        <ul className="crud-entity-list">
          {rules.map((rule) => (
            <li key={rule.repositoryId}>
              <strong>
                {rule.ownerLogin}/{rule.repositoryName}
              </strong>
              <p>
                {importLabels[rule.state]} · {rule.enabled ? "持續匯入" : "已停用"}
              </p>
              {canManage && rule.enabled && (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || pending}
                  onClick={() =>
                    send(
                      {
                        action: "set-repository-import",
                        requestId: crypto.randomUUID(),
                        projectId: data.project.id,
                        expectedVersion: data.project.version,
                        repositoryId: rule.repositoryId,
                        importIssues: null,
                      },
                      "已停用後續匯入；已加入的工作項目保留。",
                    )
                  }
                >
                  停用此儲存庫匯入
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!repositories?.some((repo) => repo.id === repositoryId)) return;
            send(
              {
                action: "set-repository-import",
                requestId: crypto.randomUUID(),
                projectId: data.project.id,
                expectedVersion: data.project.version,
                repositoryId,
                importIssues: state,
              },
              "儲存庫匯入已設定，符合條件的工作項目已開始加入。",
            );
          }}
        >
          {error && (
            <>
              <p role="alert">{error}</p>
              <button
                type="button"
                className="secondary"
                disabled={busy || pending}
                onClick={() => void loadRepositories()}
              >
                重新讀取儲存庫
              </button>
            </>
          )}
          {!error && !repositories && <p role="status">正在讀取可用儲存庫…</p>}
          {repositories && (
            <ProjectImportFields
              repositories={repositories}
              repositoryId={repositoryId}
              onRepositoryChange={setRepositoryId}
              state={state}
              onStateChange={setState}
              disabled={busy || pending}
            />
          )}
          <button disabled={busy || pending || !repositoryId || !repositories}>從儲存庫匯入</button>
        </form>
      )}
    </section>
  );
}
