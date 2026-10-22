"use client";

import type {
  RepositoryAccessCommand,
  RepositoryAccessSnapshot,
  RepositoryAccessSubjectKind,
} from "@line_bot_v1/repository/contracts/input/repository-access";
import {
  type RepositoryPermission,
  repositoryPermissions,
} from "@line_bot_v1/repository/domain/repository/value-objects/repository-capability";
import { useCallback, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import RepositoryPageHeader from "./repository-page-header";

const permissions: readonly RepositoryPermission[] = repositoryPermissions;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPermission(value: unknown): value is RepositoryPermission {
  return (
    typeof value === "string" && repositoryPermissions.some((permission) => permission === value)
  );
}

function permissionFromForm(value: FormDataEntryValue | null): RepositoryPermission {
  return isPermission(value) ? value : "read";
}

function isAccessCommand(value: unknown): value is RepositoryAccessCommand {
  return (
    isRecord(value) &&
    (value.action === "grant" || value.action === "revoke") &&
    (value.subjectKind === "USER" || value.subjectKind === "TEAM") &&
    typeof value.requestId === "string" &&
    typeof value.repositoryId === "string" &&
    typeof value.subjectId === "string" &&
    Number.isSafeInteger(value.expectedVersion) &&
    (value.action === "revoke" || isPermission(value.capability))
  );
}

function isAccessSnapshot(value: unknown): value is RepositoryAccessSnapshot & { error?: string } {
  return (
    isRecord(value) &&
    isRecord(value.repository) &&
    typeof value.repository.id === "string" &&
    typeof value.repository.ownerLogin === "string" &&
    typeof value.repository.name === "string" &&
    (value.repository.ownerKind === "USER" || value.repository.ownerKind === "ORGANIZATION") &&
    Array.isArray(value.repository.actorPermissions) &&
    value.repository.actorPermissions.every(isPermission) &&
    Array.isArray(value.directUserGrants) &&
    Array.isArray(value.teamGrants) &&
    value.directUserGrants.every(
      (grant) =>
        isRecord(grant) &&
        typeof grant.userId === "string" &&
        isPermission(grant.capability) &&
        Number.isSafeInteger(grant.version) &&
        typeof grant.isOutsideCollaborator === "boolean",
    ) &&
    value.teamGrants.every(
      (grant) =>
        isRecord(grant) &&
        typeof grant.teamId === "string" &&
        isPermission(grant.capability) &&
        Number.isSafeInteger(grant.version),
    )
  );
}

function responseError(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.error === "string" ? value.error : fallback;
}

function pendingKey(ownerLogin: string, repositoryName: string) {
  return `repository-access:${ownerLogin.toLowerCase()}/${repositoryName.toLowerCase()}`;
}

function readPending(key: string): RepositoryAccessCommand | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!isAccessCommand(value)) throw new Error();
    return value;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

export default function RepositoryAccess({
  liffId,
  ownerLogin,
  repositoryName,
}: {
  liffId: string;
  ownerLogin: string;
  repositoryName: string;
}) {
  const [data, setData] = useState<RepositoryAccessSnapshot | null>(null);
  const [pending, setPending] = useState<RepositoryAccessCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const storageKey = pendingKey(ownerLogin, repositoryName);

  const clear = useCallback(() => {
    generation.current += 1;
    setData(null);
    setPending(null);
    setBusy(false);
    setError("");
    setNotice("");
  }, []);

  async function session() {
    const token = await liffClient.ensureSession(liffId);
    if (!token) throw Object.assign(new Error("請完成 LINE 登入後重試。"), { status: 401 });
    return token;
  }

  async function load() {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const token = await session();
      const query = new URLSearchParams({ owner: ownerLogin, name: repositoryName });
      const response = await fetch(`/api/repository-access?${query}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: { "X-App-Session-Generation": token },
      });
      const payload: unknown = await response.json();
      if (!response.ok || !isAccessSnapshot(payload)) {
        throw Object.assign(new Error(responseError(payload, "Repository access 讀取失敗。")), {
          status: response.status,
        });
      }
      if (ticket !== generation.current) return;
      setData(payload);
      setPending(readPending(storageKey));
    } catch (cause) {
      if (ticket !== generation.current) return;
      setData(null);
      setPending(null);
      setError(cause instanceof Error ? cause.message : "Repository access 讀取失敗。");
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  async function execute(command: RepositoryAccessCommand) {
    if (busy) return;
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    setPending(command);
    sessionStorage.setItem(storageKey, JSON.stringify(command));
    try {
      const token = await session();
      const response = await fetch("/api/repository-access", {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "content-type": "application/json",
          "X-App-Session-Generation": token,
        },
        body: JSON.stringify(command),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) {
          sessionStorage.removeItem(storageKey);
          setPending(null);
        }
        throw Object.assign(new Error(responseError(payload, "Repository access 更新失敗。")), {
          status: response.status,
        });
      }
      sessionStorage.removeItem(storageKey);
      setPending(null);
      if (ticket !== generation.current) return;
      setNotice("Repository access 已更新。");
      await load();
    } catch (cause) {
      if (ticket === generation.current) {
        setError(cause instanceof Error ? cause.message : "結果尚未確認，請重試原 access 操作。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  function grant(
    subjectKind: RepositoryAccessSubjectKind,
    subjectId: string,
    capability: RepositoryPermission,
    expectedVersion: number,
  ) {
    if (!data || !subjectId.trim()) return;
    void execute({
      action: "grant",
      requestId: crypto.randomUUID(),
      repositoryId: data.repository.id,
      subjectKind,
      subjectId: subjectId.trim(),
      capability,
      expectedVersion,
    });
  }

  function revoke(
    subjectKind: RepositoryAccessSubjectKind,
    subjectId: string,
    expectedVersion: number,
  ) {
    if (!data) return;
    void execute({
      action: "revoke",
      requestId: crypto.randomUUID(),
      repositoryId: data.repository.id,
      subjectKind,
      subjectId,
      expectedVersion,
    });
  }

  return (
    <>
      <RepositoryPageHeader
        ownerLogin={data?.repository.ownerLogin ?? ownerLogin}
        repositoryName={data?.repository.name ?? repositoryName}
        active="access"
        canManage={data?.repository.actorPermissions.includes("admin") === true}
      />
      <div className="crud-manager">
        <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
        {busy && <p role="status">處理中…</p>}
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert">{error}</p>}
        {pending && !busy && (
          <section className="crud-guidance">
            <p>上一筆 access 操作結果尚待確認；重試會沿用同一 requestId。</p>
            <button type="button" onClick={() => void execute(pending)}>
              重試原操作
            </button>
          </section>
        )}
        {data && (
          <>
            <fieldset disabled={busy || Boolean(pending)}>
              <section className="crud-detail">
                <h2>
                  {data.repository.ownerLogin}/{data.repository.name}
                </h2>
                <p>
                  所有權：{data.repository.ownerKind === "USER" ? "Personal User" : "Organization"}
                </p>
                <p>
                  Current permissions：
                  {data.repository.actorPermissions.length
                    ? data.repository.actorPermissions.join(", ")
                    : "無"}
                </p>
                <p className="crud-lifecycle-note">
                  有效 OrganizationOwner 具有 implicit Repository ADMIN，不會寫入重複 direct grant。
                  Organization/Team membership remains owned by those scopes；Grant 不會建立
                  Organization 或 Team membership。
                </p>
              </section>

              <section className="crud-detail">
                <h2>Direct User access</h2>
                {data.repository.ownerKind === "USER" ? (
                  <p className="crud-lifecycle-note">
                    User owner 的 admin access 為固有權限，不建立重複 direct grant。
                  </p>
                ) : (
                  <p className="crud-lifecycle-note">
                    Direct User grant 可授權 active User，不要求先加入 owner
                    Organization；未加入者是 outside collaborator。Current flow 是 Repository admin
                    的立即 direct grant，沒有用 Organization membership 模擬 invitation/acceptance。
                  </p>
                )}
                {!data.directUserGrants.length && (
                  <p className="empty-copy">目前沒有 direct User grant。</p>
                )}
                {data.directUserGrants.map((item) => (
                  <article key={item.userId}>
                    <strong>{item.userId}</strong>
                    <p>
                      {item.capability} · v{item.version}
                      {data.repository.ownerKind === "ORGANIZATION" &&
                        ` · ${item.isOutsideCollaborator ? "outside collaborator" : "organization member"}`}
                    </p>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const capability = permissionFromForm(
                          new FormData(event.currentTarget).get("capability"),
                        );
                        grant("USER", item.userId, capability, item.version);
                      }}
                    >
                      <label>
                        Permission
                        <select name="capability" defaultValue={item.capability}>
                          {permissions.map((capability) => (
                            <option key={capability} value={capability}>
                              {capability}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="submit">更新</button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => revoke("USER", item.userId, item.version)}
                      >
                        撤銷
                      </button>
                    </form>
                  </article>
                ))}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    grant(
                      "USER",
                      String(form.get("subjectId") ?? ""),
                      permissionFromForm(form.get("capability")),
                      0,
                    );
                  }}
                >
                  <h3>新增 User access</h3>
                  <label>
                    User ID
                    <input name="subjectId" required maxLength={128} />
                  </label>
                  <label>
                    Permission
                    <select name="capability" defaultValue="read">
                      {permissions.map((capability) => (
                        <option key={capability} value={capability}>
                          {capability}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit">授權 User</button>
                </form>
              </section>

              {data.repository.ownerKind === "ORGANIZATION" && (
                <section className="crud-detail">
                  <h2>Organization Team access</h2>
                  <p className="crud-lifecycle-note">
                    Team 必須屬於 Repository owner Organization；TeamMembership 仍由 Team owner
                    管理。
                  </p>
                  {!data.teamGrants.length && <p className="empty-copy">目前沒有 Team grant。</p>}
                  {data.teamGrants.map((item) => (
                    <article key={item.teamId}>
                      <strong>{item.teamId}</strong>
                      <p>
                        {item.capability} · v{item.version}
                      </p>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          const capability = permissionFromForm(
                            new FormData(event.currentTarget).get("capability"),
                          );
                          grant("TEAM", item.teamId, capability, item.version);
                        }}
                      >
                        <label>
                          Permission
                          <select name="capability" defaultValue={item.capability}>
                            {permissions.map((capability) => (
                              <option key={capability} value={capability}>
                                {capability}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button type="submit">更新</button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => revoke("TEAM", item.teamId, item.version)}
                        >
                          撤銷
                        </button>
                      </form>
                    </article>
                  ))}
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      grant(
                        "TEAM",
                        String(form.get("subjectId") ?? ""),
                        permissionFromForm(form.get("capability")),
                        0,
                      );
                    }}
                  >
                    <h3>新增 Team access</h3>
                    <label>
                      Team ID
                      <input name="subjectId" required maxLength={128} />
                    </label>
                    <label>
                      Permission
                      <select name="capability" defaultValue="read">
                        {permissions.map((capability) => (
                          <option key={capability} value={capability}>
                            {capability}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit">授權 Team</button>
                  </form>
                </section>
              )}
            </fieldset>
          </>
        )}
      </div>
    </>
  );
}
