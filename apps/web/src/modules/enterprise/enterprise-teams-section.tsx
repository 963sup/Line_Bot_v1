import type {
  EnterpriseCommand,
  EnterpriseDetail,
} from "@line-work/enterprise/contracts/enterprise-governance";
import Link from "next/link";

export function EnterpriseTeamsSection({
  detail,
  teams,
  busy,
  hasPending,
  execute,
}: {
  detail: EnterpriseDetail;
  teams: EnterpriseDetail["teams"];
  busy: boolean;
  hasPending: boolean;
  execute: (command: EnterpriseCommand) => Promise<void>;
}) {
  return (
    <>
      <h3>Enterprise Teams</h3>
      {teams.map((team) => (
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
              <button disabled={busy || hasPending}>重新命名 Enterprise Team</button>
            </form>
          )}
          <strong>Members</strong>
          {team.members.map((member) => (
            <div key={member.userId}>
              {member.userId} · {member.status} · 版本 {member.version}
              {detail.actorIsOwner && member.status === "active" && (
                <button
                  disabled={busy || hasPending}
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
                  disabled={busy || hasPending}
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
                  const existing = team.members.find((member) => member.userId === targetUserId);
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
                <button disabled={busy || hasPending}>加入 Enterprise Team</button>
              </form>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const organizationAccountId = String(data.get("organizationAccountId")).trim();
                  const existing = team.organizations.find(
                    (organization) => organization.organizationAccountId === organizationAccountId,
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
                <button disabled={busy || hasPending}>指派 Team 到 Organization</button>
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
          <button disabled={busy || hasPending}>建立 Enterprise Team</button>
        </form>
      )}
    </>
  );
}
