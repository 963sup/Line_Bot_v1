"use client";

import type {
  OrganizationCommand,
  OrganizationDetail,
  OrganizationList,
} from "@line_bot_v1/organization/contracts/organization-governance";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { OrganizationDetailSection } from "./organization-detail-section";

type Pending = OrganizationCommand;

export default function OrganizationPanel({ liffId }: { liffId: string }) {
  const [list, setList] = useState<OrganizationList | null>(null);
  const [detail, setDetail] = useState<OrganizationDetail | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newLogin, setNewLogin] = useState("");
  const [newName, setNewName] = useState("");
  const epoch = useRef(0),
    locked = useRef(false),
    selected = useRef("");

  function clear() {
    epoch.current++;
    selected.current = "";
    setList(null);
    setDetail(null);
    setNotice("");
  }

  async function request(method: "GET" | "POST", body?: Pending) {
    const access = await liffClient.ensureSession(liffId);
    if (!access) throw new Error("請完成 LINE 登入後重試。");
    const response = await fetch(
      `/api/organization${selected.current ? `?id=${encodeURIComponent(selected.current)}` : ""}`,
      {
        method,
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "X-App-Session-Generation": access,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    const payload = await response.json();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) clear();
      throw Object.assign(new Error(payload.error ?? "組織服務暫不可用。"), {
        status: response.status,
      });
    }
    return payload;
  }

  async function load(id = selected.current) {
    if (locked.current) return;
    const ticket = ++epoch.current;
    selected.current = id;
    setBusy(true);
    setError("");
    try {
      const payload = await request("GET");
      if (ticket !== epoch.current) return;
      if (id) {
        if (!payload || !Array.isArray(payload.members) || !Array.isArray(payload.invitations)) {
          throw new Error("回應不完整，請重新載入。");
        }
        setDetail(payload as OrganizationDetail);
        return;
      }
      if (!payload || !Array.isArray(payload.items)) throw new Error("回應不完整，請重新載入。");
      setList(payload as OrganizationList);
      setDetail(null);
    } catch (cause) {
      if (ticket === epoch.current) setError(cause instanceof Error ? cause.message : "讀取失敗。");
    } finally {
      if (ticket === epoch.current) setBusy(false);
    }
  }

  async function execute(command: Pending) {
    if (locked.current || (pending && pending.requestId !== command.requestId)) return;
    locked.current = true;
    const ticket = epoch.current;
    setBusy(true);
    setError("");
    setNotice("");
    setPending(command);
    try {
      const result = await request("POST", command);
      if (ticket !== epoch.current) return;
      setPending(null);
      setNotice("組織變更已保存。");
      locked.current = false;
      await load(
        command.action === "create-organization"
          ? String(result.scopeId)
          : command.action === "leave-organization" || command.action === "decline-invitation"
            ? ""
            : command.organizationAccountId,
      );
    } catch (cause) {
      if (ticket === epoch.current) {
        const status = (cause as { status?: number }).status;
        if (status && status < 500 && status !== 429) setPending(null);
        setError(cause instanceof Error ? cause.message : "操作結果尚待確認，請重試原操作。");
      }
    } finally {
      locked.current = false;
      if (ticket === epoch.current) setBusy(false);
    }
  }

  const onVisibilityChange = useEffectEvent(() => {
    if (document.visibilityState === "hidden") clear();
    else void load();
  });

  useEffect(() => {
    const visibility = () => onVisibilityChange();
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);

  return (
    <div className="crud-manager resource-workspace">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      <div className="crud-toolbar">
        <p>管理你的組織與成員。</p>
        <button
          className="secondary crud-refresh"
          disabled={busy || !!pending}
          onClick={() => void load()}
        >
          重新載入
        </button>
      </div>
      {busy && <p role="status">處理中…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {pending && !busy && (
        <section>
          <p>上次操作結果尚待確認。</p>
          <button onClick={() => void execute(pending)}>重試原操作</button>
        </section>
      )}

      {list && (
        <section className="crud-collection">
          <div className="crud-section-head">
            <div>
              <h2>組織</h2>
              <p>你參與的組織與待處理邀請。</p>
            </div>
            <details className="resource-create">
              <summary>新增組織</summary>
              <div className="resource-create-fields">
                <label>
                  組織名稱
                  <input
                    aria-label="Organization name"
                    maxLength={120}
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    placeholder="Acme Team"
                  />
                </label>
                <label>
                  組織網址名稱
                  <input
                    aria-label="Organization login"
                    autoCapitalize="none"
                    autoCorrect="off"
                    maxLength={39}
                    pattern="[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?"
                    value={newLogin}
                    onChange={(event) => setNewLogin(event.target.value)}
                    placeholder="acme-team"
                  />
                </label>
                <button
                  className="crud-create"
                  disabled={busy || !!pending || !newLogin.trim() || !newName.trim()}
                  onClick={() =>
                    void execute({
                      action: "create-organization",
                      requestId: crypto.randomUUID(),
                      login: newLogin,
                      name: newName,
                      reason: "由已啟用會員建立 Organization",
                    })
                  }
                >
                  建立組織
                </button>
              </div>
            </details>
          </div>
          {list.items.length === 0 ? (
            <p className="empty-copy">目前沒有可使用的組織或待處理邀請。</p>
          ) : (
            <ul className="crud-entity-list">
              {list.items.map((item) => (
                <li key={item.id}>
                  <button
                    className="crud-entity-item"
                    disabled={busy || !!pending}
                    onClick={() => void load(item.id)}
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <small>@{item.login}</small>
                      <small>
                        {item.status} ·{" "}
                        {item.actorIsOwner
                          ? "OrganizationOwner"
                          : item.actorMemberRole === "ADMIN"
                            ? "FPT ADMIN"
                            : item.actorMembershipStatus === "active"
                              ? "Member"
                              : item.actorInvitationStatus === "pending"
                                ? "待接受邀請"
                                : "目前不可用"}
                      </small>
                    </span>
                    <span aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {detail && (
        <OrganizationDetailSection
          detail={detail}
          busy={busy}
          pending={pending}
          execute={execute}
          setError={setError}
          onBack={() => void load("")}
        />
      )}
    </div>
  );
}
