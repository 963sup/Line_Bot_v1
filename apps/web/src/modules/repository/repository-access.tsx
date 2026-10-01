"use client";

import type {
  RepositoryAccessCommand,
  RepositoryAccessSnapshot,
  RepositoryAccessSubjectKind,
} from "@line_bot_v1/repository/application/ports/access";
import type { RepositoryCapability } from "@line_bot_v1/repository/domain";
import { useCallback, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";

const capabilities: RepositoryCapability[] = ["read", "triage", "write", "admin"];

function pendingKey(ownerLogin: string, repositoryName: string) {
  return `repository-access:${ownerLogin.toLowerCase()}/${repositoryName.toLowerCase()}`;
}

function readPending(key: string): RepositoryAccessCommand | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as RepositoryAccessCommand;
    if (
      !value ||
      (value.action !== "grant" && value.action !== "revoke") ||
      (value.subjectKind !== "USER" && value.subjectKind !== "TEAM") ||
      typeof value.requestId !== "string" ||
      typeof value.repositoryId !== "string" ||
      typeof value.subjectId !== "string" ||
      !Number.isSafeInteger(value.expectedVersion)
    ) {
      throw new Error();
    }
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
    const token = await liffClient.session(liffId);
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
        headers: { "x-line-token": token },
      });
      const payload = (await response.json()) as RepositoryAccessSnapshot & { error?: string };
      if (!response.ok || !payload?.repository || !Array.isArray(payload.directUserGrants)) {
        throw Object.assign(new Error(payload.error ?? "Repository access 讀取失敗。"), {
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
          "x-line-token": token,
        },
        body: JSON.stringify(command),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) {
          sessionStorage.removeItem(storageKey);
          setPending(null);
        }
        throw Object.assign(new Error(payload.error ?? "Repository access 更新失敗。"), {
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
    capability: RepositoryCapability,
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
        <fieldset disabled={busy || Boolean(pending)}>
          <section className="crud-detail">
            <h2>
              {data.repository.ownerLogin}/{data.repository.name}
            </h2>
            <p>
              Current capability：{data.repository.actorCapability ?? "OrganizationOwner recovery"}
            </p>
            <p className="crud-lifecycle-note">
              Repository owns access grants；Organization/Team membership remains owned by those
              scopes. Grant 不會建立 Organization 或 Team membership。
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
                Direct User grant 可授權 active User，不要求先加入 owner Organization；未加入者是
                outside collaborator。Current flow 是 Repository admin 的立即 direct grant，沒有用
                Organization membership 模擬 invitation/acceptance。
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
                    const capability = new FormData(event.currentTarget).get(
                      "capability",
                    ) as RepositoryCapability;
                    grant("USER", item.userId, capability, item.version);
                  }}
                >
                  <label>
                    Capability
                    <select name="capability" defaultValue={item.capability}>
                      {capabilities.map((capability) => (
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
                  String(form.get("capability") ?? "read") as RepositoryCapability,
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
                Capability
                <select name="capability" defaultValue="read">
                  {capabilities.map((capability) => (
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
                Team 必須屬於 Repository owner Organization；TeamMembership 仍由 Team owner 管理。
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
                      const capability = new FormData(event.currentTarget).get(
                        "capability",
                      ) as RepositoryCapability;
                      grant("TEAM", item.teamId, capability, item.version);
                    }}
                  >
                    <label>
                      Capability
                      <select name="capability" defaultValue={item.capability}>
                        {capabilities.map((capability) => (
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
                    String(form.get("capability") ?? "read") as RepositoryCapability,
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
                  Capability
                  <select name="capability" defaultValue="read">
                    {capabilities.map((capability) => (
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
      )}
    </div>
  );
}
