"use client";

import type { ScopedRoleCommand } from "@line-work/identity-access/domain/role-assignment";
import type {
  OrganizationCommand,
  OrganizationDetail,
  OrganizationList,
} from "@line-work/organization/contracts/organization-governance";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";

type Pending = OrganizationCommand | ScopedRoleCommand;

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
    const access = await liffClient.session(liffId);
    if (!access) throw new Error("請完成 LINE 登入後重試。");
    const response = await fetch(
      `/api/organization${selected.current ? `?id=${encodeURIComponent(selected.current)}` : ""}`,
      {
        method,
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "x-line-token": access,
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
        "scopeKind" in command
          ? selected.current
          : command.action === "create-organization"
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
    <div className="crud-manager">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      <div className="crud-toolbar">
        <p>Organization 的建立、選擇、成員與治理操作都在這個畫面。</p>
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
              <p>選擇一個 Organization 進入詳情；建立新組織也從這裡開始。</p>
            </div>
            <div className="inline-actions">
              <input
                aria-label="Organization name"
                maxLength={120}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Acme Team"
              />
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
                ＋ 建立組織
              </button>
            </div>
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
        <section className="crud-detail">
          <div className="crud-detail-head">
            <div>
              <span className="crud-kicker">組織詳情</span>
              <h2>{detail.name}</h2>
              <p>@{detail.login}</p>
              <p>
                狀態：{detail.status} · 版本 {detail.version}
              </p>
            </div>
            <button
              className="secondary crud-back"
              disabled={busy || !!pending}
              onClick={() => void load("")}
            >
              返回組織列表
            </button>
          </div>
          <p className="crud-lifecycle-note">
            Lifecycle：目前沒有 hard delete。OrganizationOwner
            使用停用／重新啟用管理生命週期；本人可退出。
          </p>

          {detail.actorInvitationStatus === "pending" && !detail.actorMembershipStatus && (
            <button
              disabled={busy || !!pending}
              onClick={() => {
                const invitation = detail.invitations.find((item) => item.status === "pending");
                if (!invitation) return;
                void execute({
                  action: "accept-invitation",
                  requestId: crypto.randomUUID(),
                  organizationAccountId: detail.id,
                  targetUserId: invitation.userId,
                  expectedVersion: invitation.version,
                  reason: "由受邀使用者接受 Organization invitation",
                });
              }}
            >
              接受組織邀請
            </button>
          )}
          {detail.actorInvitationStatus === "pending" && !detail.actorMembershipStatus && (
            <button
              className="secondary"
              disabled={busy || !!pending}
              onClick={() => {
                const invitation = detail.invitations.find((item) => item.status === "pending");
                if (!invitation) return;
                void execute({
                  action: "decline-invitation",
                  requestId: crypto.randomUUID(),
                  organizationAccountId: detail.id,
                  targetUserId: invitation.userId,
                  expectedVersion: invitation.version,
                  reason: "由受邀使用者拒絕 Organization invitation",
                });
              }}
            >
              拒絕組織邀請
            </button>
          )}

          {detail.actorIsOwner && (
            <button
              disabled={busy || !!pending}
              onClick={() =>
                void execute({
                  action: detail.status === "active" ? "deactivate" : "reactivate",
                  requestId: crypto.randomUUID(),
                  organizationAccountId: detail.id,
                  expectedVersion: detail.version,
                  reason: "由組織治理頁提出",
                })
              }
            >
              {detail.status === "active" ? "停用組織" : "重新啟用組織"}
            </button>
          )}
          {detail.status === "active" && detail.actorDirectMembershipVersion !== null && (
            <button
              className="secondary"
              disabled={busy || !!pending}
              onClick={() =>
                void execute({
                  action: "leave-organization",
                  requestId: crypto.randomUUID(),
                  organizationAccountId: detail.id,
                  expectedVersion: detail.actorDirectMembershipVersion!,
                  reason: "由會員本人退出 Organization",
                })
              }
            >
              退出組織
            </button>
          )}

          <h3>成員</h3>
          {detail.members.map((member) => (
            <article key={member.userId}>
              <strong>{member.userId}</strong>
              <p>
                {member.status}
                {member.effectiveOwner ? " · OrganizationOwner" : ""}
              </p>
              <p>
                Membership sources：
                {member.sources.length > 0
                  ? member.sources
                      .map((source) =>
                        source.kind === "direct"
                          ? "Direct membership"
                          : `Enterprise Team ${source.id}`,
                      )
                      .join("、")
                  : "None"}
              </p>
              {detail.actorIsOwner && member.directMembershipVersion !== null && (
                <button
                  disabled={busy || !!pending}
                  onClick={() =>
                    void execute({
                      action: "remove-direct-membership",
                      requestId: crypto.randomUUID(),
                      organizationAccountId: detail.id,
                      targetUserId: member.userId,
                      expectedVersion: member.directMembershipVersion!,
                      reason: "由 OrganizationOwner 移除 direct membership",
                    })
                  }
                >
                  移除 direct membership
                </button>
              )}
            </article>
          ))}

          {detail.actorIsOwner && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const targetUserId = String(data.get("user")).trim();
                const invitation = detail.invitations.find((item) => item.userId === targetUserId);
                void execute({
                  action: "invite-member",
                  requestId: crypto.randomUUID(),
                  organizationAccountId: detail.id,
                  targetUserId,
                  expectedVersion: invitation?.version ?? 0,
                  reason: String(data.get("reason")).trim(),
                });
              }}
            >
              <h3>邀請成員</h3>
              <label>
                User 編號
                <input name="user" required maxLength={128} />
              </label>
              <label>
                原因
                <textarea name="reason" required maxLength={500} />
              </label>
              <button disabled={busy || !!pending}>送出 invitation</button>
            </form>
          )}

          <h3>邀請</h3>
          {detail.invitations.map((invitation) => (
            <article key={invitation.userId}>
              <strong>{invitation.userId}</strong>
              <p>
                {invitation.status} · 版本 {invitation.version}
              </p>
              {detail.actorIsOwner && invitation.status === "pending" && (
                <button
                  disabled={busy || !!pending}
                  onClick={() =>
                    void execute({
                      action: "cancel-invitation",
                      requestId: crypto.randomUUID(),
                      organizationAccountId: detail.id,
                      targetUserId: invitation.userId,
                      expectedVersion: invitation.version,
                      reason: "由 OrganizationOwner 取消 invitation",
                    })
                  }
                >
                  取消 invitation
                </button>
              )}
            </article>
          ))}

          {detail.actorIsOwner && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const targetUserId = String(data.get("targetUserId")).trim();
                const member = detail.members.find(
                  (item) => item.userId === targetUserId && item.status === "active",
                );
                if (!member) {
                  setError("OrganizationOwner 對象必須是有效 Organization member。");
                  return;
                }
                void execute({
                  action: String(data.get("action")) as ScopedRoleCommand["action"],
                  requestId: crypto.randomUUID(),
                  scopeKind: "organization",
                  scopeId: detail.id,
                  principal: { kind: "user", id: targetUserId },
                  role: "OrganizationOwner",
                  expectedVersion: member.assignmentVersion ?? 0,
                  reason: String(data.get("reason")).trim(),
                });
              }}
            >
              <h3>Organization owner role</h3>
              <label>
                Organization member
                <input name="targetUserId" required maxLength={128} />
              </label>
              <label>
                操作
                <select name="action" defaultValue="grant">
                  <option value="grant">授予 OrganizationOwner</option>
                  <option value="revoke">撤銷 OrganizationOwner</option>
                </select>
              </label>
              <label>
                原因
                <textarea name="reason" required maxLength={500} />
              </label>
              <button disabled={busy || !!pending} type="submit">
                保存 owner role
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
