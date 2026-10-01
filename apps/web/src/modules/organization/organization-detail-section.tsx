import type {
  OrganizationCommand,
  OrganizationDetail,
} from "@line_bot_v1/organization/contracts/organization-governance";

type PendingOrganizationCommand = OrganizationCommand;

export function OrganizationDetailSection({
  detail,
  busy,
  pending,
  execute,
  setError,
  onBack,
}: {
  detail: OrganizationDetail;
  busy: boolean;
  pending: PendingOrganizationCommand | null;
  execute: (command: PendingOrganizationCommand) => Promise<void>;
  setError: (message: string) => void;
  onBack: () => void;
}) {
  return (
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
        <button className="secondary crud-back" disabled={busy || !!pending} onClick={onBack}>
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
                    source.kind === "direct" ? "Direct membership" : `Enterprise Team ${source.id}`,
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
              action:
                data.get("action") === "revoke"
                  ? "revoke-organization-owner"
                  : "grant-organization-owner",
              requestId: crypto.randomUUID(),
              organizationAccountId: detail.id,
              targetUserId,
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
  );
}
