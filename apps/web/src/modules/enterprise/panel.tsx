"use client";

import type {
  EnterpriseCommand,
  EnterpriseDetail,
  EnterpriseList,
} from "@line-work/enterprise/contracts/enterprise-governance";
import type { ScopedRoleCommand } from "@line-work/identity-access/domain/role-assignment";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";

function affiliationLabel(sources: EnterpriseDetail["actorAffiliations"]) {
  return sources
    .map((source) => (source.kind === "direct" ? "直接隸屬" : `Organization ${source.id}`))
    .join("、");
}

export default function EnterprisePanel({
  liffId,
  initialSlug,
  initialTeamSlug,
}: {
  liffId: string;
  initialSlug?: string;
  initialTeamSlug?: string;
}) {
  const router = useRouter();
  const canonicalTeam = Boolean(initialSlug && initialTeamSlug);
  const [list, setList] = useState<EnterpriseList | null>(null);
  const [detail, setDetail] = useState<EnterpriseDetail | null>(null);
  const [pending, setPending] = useState<(EnterpriseCommand | ScopedRoleCommand) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const epoch = useRef(0),
    selected = useRef(""),
    routedSlug = useRef(initialSlug ?? ""),
    routedTeamId = useRef(""),
    locked = useRef(false);

  function clear() {
    epoch.current++;
    selected.current = "";
    routedSlug.current = initialSlug ?? "";
    routedTeamId.current = "";
    setList(null);
    setDetail(null);
    setNotice("");
  }

  async function request(method: "GET" | "POST", body?: EnterpriseCommand | ScopedRoleCommand) {
    const access = await liffClient.session(liffId);
    if (!access) throw new Error("請完成 LINE 登入後重試。");
    const selector = selected.current
      ? `?id=${encodeURIComponent(selected.current)}`
      : routedSlug.current
        ? `?slug=${encodeURIComponent(routedSlug.current)}`
        : "";
    const response = await fetch(`/api/enterprise${selector}`, {
      method,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "x-line-token": access,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) clear();
      throw Object.assign(new Error(payload.error ?? "企業服務暫不可用。"), {
        status: response.status,
      });
    }
    return payload;
  }

  async function load(id = selected.current) {
    if (locked.current) return;
    const ticket = ++epoch.current;
    const routedDetail = Boolean(id || routedSlug.current);
    selected.current = id;
    setBusy(true);
    setError("");
    try {
      const payload = await request("GET");
      if (ticket !== epoch.current) return;
      if (routedDetail) {
        if (
          !payload ||
          !Array.isArray(payload.users) ||
          !Array.isArray(payload.directAffiliations) ||
          !Array.isArray(payload.invitations) ||
          !Array.isArray(payload.organizations) ||
          !Array.isArray(payload.teams)
        ) {
          throw new Error("回應不完整，請重新載入。");
        }
        const detail = payload as EnterpriseDetail;
        selected.current = detail.id;
        routedSlug.current = "";
        if (canonicalTeam) {
          const team = routedTeamId.current
            ? detail.teams.find((item) => item.id === routedTeamId.current)
            : detail.teams.find((item) => item.slug === initialTeamSlug);
          if (!team) throw new Error("找不到可存取的 Enterprise Team。");
          routedTeamId.current = team.id;
          if (!detail.slug || !team.slug) throw new Error("Enterprise Team locator 尚未完成。");
          router.replace(
            `/enterprises/${encodeURIComponent(detail.slug)}/teams/${encodeURIComponent(team.slug)}`,
          );
        }
        setDetail(detail);
        return;
      }
      if (!payload || !Array.isArray(payload.items)) throw new Error("回應不完整，請重新載入。");
      setList(payload as EnterpriseList);
      setDetail(null);
    } catch (cause) {
      if (ticket === epoch.current) setError(cause instanceof Error ? cause.message : "讀取失敗。");
    } finally {
      if (ticket === epoch.current) setBusy(false);
    }
  }

  async function execute(command: EnterpriseCommand | ScopedRoleCommand) {
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
      setNotice("企業變更已保存。");
      locked.current = false;
      await load(
        "scopeKind" in command
          ? selected.current
          : command.action === "create-enterprise"
            ? String(result.scopeId)
            : command.action === "leave-enterprise" || command.action === "decline-invitation"
              ? ""
              : command.enterpriseAccountId,
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

  useEffect(() => {
    const visibility = () => (document.visibilityState === "hidden" ? clear() : void load());
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);

  const actorDirectAffiliation =
    detail?.actorAffiliations.find((source) => source.kind === "direct") ?? null;
  const visibleEnterpriseTeams =
    detail?.teams.filter((team) => !canonicalTeam || team.id === routedTeamId.current) ?? [];

  return (
    <div className="crud-manager">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      <div className="crud-toolbar">
        <p>Enterprise 的建立、選擇與治理都在這個畫面。</p>
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
              <h2>企業</h2>
              <p>選擇一個 Enterprise 進入詳情；建立新企業也從這裡開始。</p>
            </div>
            <div className="inline-actions">
              <input
                aria-label="Enterprise name"
                maxLength={120}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Acme Enterprise"
              />
              <input
                aria-label="Enterprise slug"
                autoCapitalize="none"
                autoCorrect="off"
                maxLength={39}
                pattern="[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?"
                value={newSlug}
                onChange={(event) => setNewSlug(event.target.value)}
                placeholder="acme-enterprise"
              />
              <button
                className="crud-create"
                disabled={busy || !!pending || !newSlug.trim() || !newName.trim()}
                onClick={() =>
                  void execute({
                    action: "create-enterprise",
                    requestId: crypto.randomUUID(),
                    slug: newSlug,
                    name: newName,
                    reason: "由已啟用會員建立 Enterprise",
                  })
                }
              >
                ＋ 建立企業
              </button>
            </div>
          </div>
          {list.items.length === 0 ? (
            <p className="empty-copy">目前沒有可使用的企業或待處理邀請。</p>
          ) : (
            <ul className="crud-entity-list">
              {list.items.map((item) => (
                <li key={item.id}>
                  {item.slug ? (
                    <Link
                      className="crud-entity-item"
                      href={`/enterprises/${encodeURIComponent(item.slug)}`}
                    >
                      <span>
                        <strong>{item.name ?? item.id}</strong>
                        <small>{item.slug}</small>
                        <small>
                          {item.status} · {item.actorIsOwner ? "EnterpriseOwner · " : ""}
                          {item.actorAffiliations.length > 0
                            ? affiliationLabel(item.actorAffiliations)
                            : item.actorInvitationStatus === "pending"
                              ? "待接受邀請"
                              : "目前不可用"}
                        </small>
                      </span>
                      <span aria-hidden="true">›</span>
                    </Link>
                  ) : (
                    <button
                      className="crud-entity-item"
                      disabled={busy || !!pending}
                      onClick={() => void load(item.id)}
                    >
                      <span>
                        <strong>{item.name ?? item.id}</strong>
                        <small>尚未設定 slug</small>
                      </span>
                      <span aria-hidden="true">›</span>
                    </button>
                  )}
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
              <span className="crud-kicker">企業詳情</span>
              <h2>{detail.name ?? detail.id}</h2>
              {detail.slug && <p>{detail.slug}</p>}
              <p>
                狀態：{detail.status} · 版本 {detail.version} · 我的來源：
                {detail.actorAffiliations.length > 0
                  ? affiliationLabel(detail.actorAffiliations)
                  : detail.actorInvitationStatus === "pending"
                    ? "待接受邀請"
                    : "無"}
              </p>
            </div>
            {initialSlug ? (
              <Link className="secondary crud-back" href="/enterprises">
                返回企業列表
              </Link>
            ) : (
              <button
                className="secondary crud-back"
                disabled={busy || !!pending}
                onClick={() => void load("")}
              >
                返回企業列表
              </button>
            )}
          </div>
          <p className="crud-lifecycle-note">
            Lifecycle：目前沒有 hard delete。EnterpriseOwner
            使用停用／重新啟用管理生命週期；本人可退出。
          </p>

          {detail.actorInvitationStatus === "pending" && detail.actorAffiliations.length === 0 && (
            <button
              disabled={busy || !!pending}
              onClick={() => {
                const invitation = detail.invitations.find((item) => item.status === "pending");
                if (!invitation) return;
                void execute({
                  action: "accept-invitation",
                  requestId: crypto.randomUUID(),
                  enterpriseAccountId: detail.id,
                  targetUserId: invitation.userId,
                  expectedVersion: invitation.version,
                  reason: "由受邀使用者接受 Enterprise invitation",
                });
              }}
            >
              接受企業邀請
            </button>
          )}
          {detail.actorInvitationStatus === "pending" && detail.actorAffiliations.length === 0 && (
            <button
              className="secondary"
              disabled={busy || !!pending}
              onClick={() => {
                const invitation = detail.invitations.find((item) => item.status === "pending");
                if (!invitation) return;
                void execute({
                  action: "decline-invitation",
                  requestId: crypto.randomUUID(),
                  enterpriseAccountId: detail.id,
                  targetUserId: invitation.userId,
                  expectedVersion: invitation.version,
                  reason: "由受邀使用者拒絕 Enterprise invitation",
                });
              }}
            >
              拒絕企業邀請
            </button>
          )}

          {detail.actorIsOwner && (
            <button
              disabled={busy || !!pending}
              onClick={() =>
                void execute({
                  action: detail.status === "active" ? "deactivate" : "reactivate",
                  requestId: crypto.randomUUID(),
                  enterpriseAccountId: detail.id,
                  expectedVersion: detail.version,
                  reason: "由企業治理頁提出",
                })
              }
            >
              {detail.status === "active" ? "停用企業" : "重新啟用企業"}
            </button>
          )}
          {detail.status === "active" && actorDirectAffiliation && (
            <button
              className="secondary"
              disabled={busy || !!pending}
              onClick={() =>
                void execute({
                  action: "leave-enterprise",
                  requestId: crypto.randomUUID(),
                  enterpriseAccountId: detail.id,
                  expectedVersion: actorDirectAffiliation.version,
                  reason: "由會員本人退出 Enterprise",
                })
              }
            >
              退出企業
            </button>
          )}

          <h3>使用者與治理角色</h3>
          {detail.users.map((user) => (
            <article key={user.userId}>
              <strong>{user.userId}</strong>
              <p>
                {user.sources
                  .map((source) =>
                    source.kind === "direct" ? "Direct affiliation" : `Organization ${source.id}`,
                  )
                  .join("、")}
                {user.effectiveOwner ? " · EnterpriseOwner" : ""}
              </p>
            </article>
          ))}

          {detail.actorIsOwner && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const targetUserId = String(data.get("targetUserId")).trim();
                const user = detail.users.find((item) => item.userId === targetUserId);
                if (!user) {
                  setError("EnterpriseOwner 對象必須是目前有效的 Enterprise user。");
                  return;
                }
                void execute({
                  action: String(data.get("action")) as ScopedRoleCommand["action"],
                  requestId: crypto.randomUUID(),
                  scopeKind: "enterprise",
                  scopeId: detail.id,
                  principal: { kind: "user", id: targetUserId },
                  role: "EnterpriseOwner",
                  expectedVersion: user.assignmentVersion ?? 0,
                  reason: String(data.get("reason")).trim(),
                });
              }}
            >
              <h3>Enterprise owner role</h3>
              <label>
                Enterprise user
                <input name="targetUserId" required maxLength={128} />
              </label>
              <label>
                操作
                <select name="action" defaultValue="grant">
                  <option value="grant">授予 EnterpriseOwner</option>
                  <option value="revoke">撤銷 EnterpriseOwner</option>
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

          <h3>直接隸屬</h3>
          {detail.directAffiliations.map((affiliation) => (
            <article key={affiliation.userId}>
              <strong>{affiliation.userId}</strong>
              <p>
                {affiliation.status} · 版本 {affiliation.version}
              </p>
              {detail.actorIsOwner && affiliation.status === "active" && (
                <button
                  disabled={busy || !!pending}
                  onClick={() =>
                    void execute({
                      action: "remove-direct-affiliation",
                      requestId: crypto.randomUUID(),
                      enterpriseAccountId: detail.id,
                      targetUserId: affiliation.userId,
                      expectedVersion: affiliation.version,
                      reason: "由 EnterpriseOwner 移除 direct affiliation",
                    })
                  }
                >
                  移除 direct affiliation
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
                  action: "invite-user",
                  requestId: crypto.randomUUID(),
                  enterpriseAccountId: detail.id,
                  targetUserId,
                  expectedVersion: invitation?.version ?? 0,
                  reason: String(data.get("reason")).trim(),
                });
              }}
            >
              <h3>邀請 Enterprise user</h3>
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
                      enterpriseAccountId: detail.id,
                      targetUserId: invitation.userId,
                      expectedVersion: invitation.version,
                      reason: "由 EnterpriseOwner 取消 invitation",
                    })
                  }
                >
                  取消 invitation
                </button>
              )}
            </article>
          ))}

          <h3>Enterprise Teams</h3>
          {visibleEnterpriseTeams.map((team) => (
            <article key={team.id}>
              <h4>
                {detail.slug && team.slug ? (
                  <Link
                    href={`/enterprises/${encodeURIComponent(
                      detail.slug,
                    )}/teams/${encodeURIComponent(team.slug)}`}
                  >
                    {team.name}
                  </Link>
                ) : (
                  team.name
                )}{" "}
                · {team.id}
              </h4>
              {team.slug && <p>Team slug {team.slug}</p>}
              <p>Team version {team.version}</p>
              {detail.actorIsOwner && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void execute({
                      action: "rename-enterprise-team",
                      requestId: crypto.randomUUID(),
                      enterpriseAccountId: detail.id,
                      teamId: team.id,
                      name: String(data.get("name")).trim(),
                      expectedVersion: team.version,
                      reason: String(data.get("reason")).trim(),
                    });
                  }}
                >
                  <label>
                    Team name
                    <input name="name" required maxLength={80} defaultValue={team.name} />
                  </label>
                  <label>
                    原因
                    <textarea name="reason" required maxLength={500} />
                  </label>
                  <button disabled={busy || !!pending}>重新命名 Enterprise Team</button>
                </form>
              )}
              <strong>Members</strong>
              {team.members.map((member) => (
                <div key={member.userId}>
                  {member.userId} · {member.status} · 版本 {member.version}
                  {detail.actorIsOwner && member.status === "active" && (
                    <button
                      disabled={busy || !!pending}
                      onClick={() =>
                        void execute({
                          action: "remove-enterprise-team-member",
                          requestId: crypto.randomUUID(),
                          enterpriseAccountId: detail.id,
                          teamId: team.id,
                          targetUserId: member.userId,
                          expectedVersion: member.version,
                          reason: "由 EnterpriseOwner 移除 Enterprise Team member",
                        })
                      }
                    >
                      移除 Team member
                    </button>
                  )}
                </div>
              ))}
              <strong>Organization access</strong>
              {team.organizations.map((organization) => (
                <div key={organization.organizationAccountId}>
                  {organization.organizationAccountId} · {organization.status} · 版本{" "}
                  {organization.version}
                  {detail.actorIsOwner && organization.status === "active" && (
                    <button
                      disabled={busy || !!pending}
                      onClick={() =>
                        void execute({
                          action: "detach-enterprise-team-organization",
                          requestId: crypto.randomUUID(),
                          enterpriseAccountId: detail.id,
                          teamId: team.id,
                          organizationAccountId: organization.organizationAccountId,
                          expectedVersion: organization.version,
                          reason: "由 EnterpriseOwner 解除 Enterprise Team Organization access",
                        })
                      }
                    >
                      解除 Team Organization access
                    </button>
                  )}
                </div>
              ))}
              {detail.actorIsOwner && (
                <>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      const targetUserId = String(data.get("userId")).trim();
                      const existing = team.members.find(
                        (member) => member.userId === targetUserId,
                      );
                      void execute({
                        action: "add-enterprise-team-member",
                        requestId: crypto.randomUUID(),
                        enterpriseAccountId: detail.id,
                        teamId: team.id,
                        targetUserId,
                        expectedVersion: existing?.version ?? 0,
                        reason: String(data.get("reason")).trim(),
                      });
                    }}
                  >
                    <label>
                      Enterprise user
                      <input name="userId" required maxLength={128} />
                    </label>
                    <label>
                      原因
                      <textarea name="reason" required maxLength={500} />
                    </label>
                    <button disabled={busy || !!pending}>加入 Enterprise Team</button>
                  </form>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      const organizationAccountId = String(
                        data.get("organizationAccountId"),
                      ).trim();
                      const existing = team.organizations.find(
                        (organization) =>
                          organization.organizationAccountId === organizationAccountId,
                      );
                      void execute({
                        action: "assign-enterprise-team-organization",
                        requestId: crypto.randomUUID(),
                        enterpriseAccountId: detail.id,
                        teamId: team.id,
                        organizationAccountId,
                        expectedVersion: existing?.version ?? 0,
                        reason: String(data.get("reason")).trim(),
                      });
                    }}
                  >
                    <label>
                      Organization
                      <input name="organizationAccountId" required maxLength={128} />
                    </label>
                    <label>
                      原因
                      <textarea name="reason" required maxLength={500} />
                    </label>
                    <button disabled={busy || !!pending}>指派 Team 到 Organization</button>
                  </form>
                </>
              )}
            </article>
          ))}
          {detail.actorIsOwner && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void execute({
                  action: "create-enterprise-team",
                  requestId: crypto.randomUUID(),
                  enterpriseAccountId: detail.id,
                  name: String(data.get("name")).trim(),
                  reason: String(data.get("reason")).trim(),
                });
              }}
            >
              <h4>建立 Enterprise Team</h4>
              <label>
                Team name
                <input name="name" required maxLength={80} />
              </label>
              <label>
                原因
                <textarea name="reason" required maxLength={500} />
              </label>
              <button disabled={busy || !!pending}>建立 Enterprise Team</button>
            </form>
          )}

          <h3>已連結的 Organization</h3>
          {detail.organizations.map((organization) => (
            <p key={organization.organizationAccountId}>
              {organization.organizationAccountId} · {organization.status} · 版本{" "}
              {organization.version}
            </p>
          ))}
          {detail.actorIsOwner && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const organizationAccountId = String(data.get("organizationAccountId")).trim();
                void execute({
                  action:
                    data.get("relationAction") === "detach-organization"
                      ? "detach-organization"
                      : "attach-organization",
                  requestId: crypto.randomUUID(),
                  enterpriseAccountId: detail.id,
                  organizationAccountId,
                  expectedEnterpriseVersion: detail.version,
                  expectedOrganizationVersion: Number(data.get("organizationVersion")),
                  expectedRelationVersion: Number(data.get("relationVersion")),
                  reason: String(data.get("reason")).trim(),
                });
              }}
            >
              <label>
                關係操作
                <select name="relationAction">
                  <option value="attach-organization">連結</option>
                  <option value="detach-organization">解除連結</option>
                </select>
              </label>
              <label>
                組織編號
                <input name="organizationAccountId" required maxLength={128} />
              </label>
              <label>
                組織版本
                <input name="organizationVersion" type="number" min="1" required />
              </label>
              <label>
                關係版本
                <input name="relationVersion" type="number" min="0" defaultValue="0" required />
              </label>
              <label>
                原因
                <textarea name="reason" required maxLength={500} />
              </label>
              <button disabled={busy || !!pending} type="submit">
                保存 Organization 關係
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
