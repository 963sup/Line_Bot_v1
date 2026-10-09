"use client";

import type { ProjectManagementCommand } from "@line_bot_v1/project/contracts/management";
import { useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import {
  type ProjectActor,
  type ProjectOwnerOption,
  ProjectRequestError,
  postProjectCommand,
  requestProjectActor,
  requestProjectOwnerOrganizations,
} from "./project-requests";

type CreateProjectCommand = Extract<ProjectManagementCommand, { action: "create-project" }>;
type PendingCreate = Readonly<{ actorUserId: string; command: CreateProjectCommand }>;

function pendingKey(actorUserId: string) {
  return `project-create:${actorUserId}`;
}

function readPending(actorUserId: string): PendingCreate | null {
  try {
    const raw = sessionStorage.getItem(pendingKey(actorUserId));
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingCreate;
    const command = value?.command;
    if (
      value.actorUserId !== actorUserId ||
      command?.action !== "create-project" ||
      (command.ownerAccountId !== actorUserId && command.ownerKind === "USER") ||
      (command.ownerKind !== "USER" && command.ownerKind !== "ORGANIZATION") ||
      typeof command.requestId !== "string" ||
      !Number.isSafeInteger(command.expectedVersion) ||
      command.expectedVersion !== 0 ||
      typeof command.title !== "string" ||
      typeof command.public !== "boolean" ||
      command.repositoryId !== null ||
      command.teamId !== null
    ) {
      sessionStorage.removeItem(pendingKey(actorUserId));
      return null;
    }
    return value;
  } catch {
    sessionStorage.removeItem(pendingKey(actorUserId));
    return null;
  }
}

function savePending(operation: PendingCreate) {
  sessionStorage.setItem(pendingKey(operation.actorUserId), JSON.stringify(operation));
}

function clearPending(actorUserId: string) {
  try {
    sessionStorage.removeItem(pendingKey(actorUserId));
  } catch {
    // Keep the original requestId available if storage cannot be cleared.
  }
}

export default function ProjectCreate({ liffId }: { liffId: string }) {
  const [actor, setActor] = useState<ProjectActor | null>(null);
  const [owners, setOwners] = useState<readonly ProjectOwnerOption[] | null>(null);
  const [ownerAccountId, setOwnerAccountId] = useState("");
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState<PendingCreate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [organizationWarning, setOrganizationWarning] = useState("");
  const locked = useRef(false);
  const generation = useRef(0);

  function clear() {
    generation.current++;
    setActor(null);
    setOwners(null);
    setOwnerAccountId("");
    setPending(null);
    setBusy(false);
    setError("");
    setOrganizationWarning("");
  }

  async function load() {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    setOrganizationWarning("");
    try {
      const token = await liffClient.ensureSession(liffId);
      if (!token) throw new ProjectRequestError("請完成 LINE 登入後重試。", 401);
      const currentActor = await requestProjectActor(token);
      if (ticket !== generation.current) return;
      const personalOwner: ProjectOwnerOption = {
        id: currentActor.id,
        kind: "USER",
        login: currentActor.login,
      };
      let choices: readonly ProjectOwnerOption[] = [personalOwner];
      let warning = "";
      try {
        choices = [personalOwner, ...(await requestProjectOwnerOrganizations(token))];
      } catch {
        warning = "Organization 清單暫時無法讀取；仍可建立個人 Project。";
      }
      if (ticket !== generation.current) return;
      setActor(currentActor);
      setOwners(choices);
      setOwnerAccountId((current) =>
        choices.some((owner) => owner.id === current) ? current : personalOwner.id,
      );
      setOrganizationWarning(warning);
      setPending(readPending(currentActor.id));
    } catch (cause) {
      if (ticket === generation.current) {
        setActor(null);
        setOwners(null);
        setPending(null);
        setError(cause instanceof Error ? cause.message : "Project 建立頁讀取失敗。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  async function execute(operation: PendingCreate) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const token = await liffClient.ensureSession(liffId);
      if (!token) throw new ProjectRequestError("請完成 LINE 登入後重試。", 401);
      const currentActor = await requestProjectActor(token);
      if (currentActor.id !== operation.actorUserId) {
        throw new ProjectRequestError("LINE 使用者已切換，請重新讀取 Project 建立頁。", 403);
      }
      const receipt = await postProjectCommand(token, operation.command);
      if (
        receipt.requestId !== operation.command.requestId ||
        receipt.action !== operation.command.action ||
        !receipt.projectId ||
        receipt.resourceId !== receipt.projectId ||
        !Number.isSafeInteger(receipt.version)
      ) {
        throw new ProjectRequestError("建立回執不完整，請重試原操作。", 503);
      }
      clearPending(operation.actorUserId);
      setPending(null);
      window.location.assign(`/projects/${encodeURIComponent(receipt.projectId)}`);
    } catch (cause) {
      const status = cause instanceof ProjectRequestError ? cause.status : 503;
      if (status < 500 && status !== 429) {
        clearPending(operation.actorUserId);
        setPending(null);
      }
      setError(
        cause instanceof Error ? cause.message : "建立結果尚待確認；請重試原操作以確認結果。",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  function create() {
    if (!actor || !owners || pending || !title.trim()) return;
    const owner = owners.find((item) => item.id === ownerAccountId);
    if (!owner) return;
    const command: CreateProjectCommand = {
      action: "create-project",
      requestId: crypto.randomUUID(),
      ownerAccountId: owner.id,
      ownerKind: owner.kind,
      expectedVersion: 0,
      title: title.trim(),
      public: false,
      repositoryId: null,
      teamId: null,
    };
    const operation = { actorUserId: actor.id, command };
    try {
      savePending(operation);
      setPending(operation);
      void execute(operation);
    } catch {
      setError("無法保存安全重試資訊；這次 Project 建立尚未送出。");
    }
  }

  const selectedOwner = owners?.find((owner) => owner.id === ownerAccountId);

  return (
    <div className="crud-manager">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      {busy && <p role="status">處理中…</p>}
      {error && <p role="alert">{error}</p>}
      {organizationWarning && <p role="status">{organizationWarning}</p>}
      {pending && !busy && (
        <section className="crud-guidance">
          <p>建立結果尚待確認；重試會沿用原 requestId，不會建立第二個 Project。</p>
          <button type="button" onClick={() => void execute(pending)}>
            重試原操作
          </button>
        </section>
      )}
      {owners && !pending && (
        <section className="crud-detail">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              create();
            }}
          >
            <label>
              Project owner
              <select
                value={ownerAccountId}
                onChange={(event) => setOwnerAccountId(event.target.value)}
                disabled={busy}
              >
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    @{owner.login} · {owner.kind === "USER" ? "Personal" : "Organization"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Project 名稱
              <input
                required
                maxLength={160}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={busy}
                placeholder="產品 MVP"
              />
            </label>
            <p className="crud-lifecycle-note">
              新 Project 預設為 private；Repository 權限不會自動成為 Project 權限。
            </p>
            <button disabled={busy || !selectedOwner || !title.trim()}>建立 Project</button>
          </form>
        </section>
      )}
    </div>
  );
}
