import { buildNamespacePath } from "@line_bot_v1/namespace";
import type { TeamCommand } from "@line_bot_v1/team/application/commands/team-command";
import type { TeamView } from "@line_bot_v1/team/contracts";
import type { RefObject } from "react";
import styles from "./team.module.css";
import type { TeamDraft } from "./team-command";
import { buildTeamCommand, teamActionLabels } from "./team-command";

export function TeamWorkspace({
  data,
  draft,
  setDraft,
  busy,
  pending,
  send,
  editor,
  selectOrganization,
  selectTeam,
}: {
  data: TeamView;
  draft: TeamDraft | null;
  setDraft: (draft: TeamDraft | null) => void;
  busy: boolean;
  pending: TeamCommand | null;
  send: (command: TeamCommand) => Promise<void>;
  editor: RefObject<HTMLFormElement | null>;
  selectOrganization: (organizationAccountId: string) => void;
  selectTeam: (organizationAccountId: string, teamId: string) => void;
}) {
  const maintainer = data.team?.isMaintainer === true;
  return (
    <>
      <fieldset disabled={busy || !!pending}>
        <section className="crud-scope-picker">
          <div className="crud-section-head">
            <div>
              <h2>團隊</h2>
              <p>選擇組織，查看或建立團隊。</p>
            </div>
            <button
              type="button"
              className="crud-create"
              disabled={!data.organizationAccountId}
              onClick={() => setDraft({ action: "create-team", name: "" })}
            >
              新增團隊
            </button>
          </div>
          <label>
            組織
            <select
              aria-label="組織"
              value={data.organizationAccountId ?? ""}
              onChange={(event) => {
                setDraft(null);
                selectOrganization(event.target.value);
              }}
            >
              <option value="">選擇組織</option>
              {data.organizations.map((organization) => (
                <option
                  key={organization.organizationAccountId}
                  value={organization.organizationAccountId}
                >
                  {organization.organizationAccountId}
                </option>
              ))}
            </select>
          </label>

          {data.organizationAccountId && (
            <ul className="crud-entity-list" aria-label="團隊列表">
              {data.teams.map((team) => (
                <li key={team.id}>
                  <button
                    type="button"
                    className="crud-entity-item"
                    aria-current={data.team?.id === team.id ? "true" : undefined}
                    onClick={() => {
                      setDraft(null);
                      selectTeam(data.organizationAccountId ?? "", team.id);
                    }}
                  >
                    <span>
                      <strong>{team.name}</strong>
                      <small>
                        {team.privacy === "SECRET" ? "Secret" : "Visible"} ·{" "}
                        {team.membershipStatus === "active"
                          ? team.membershipType === "CHILD_TEAM"
                            ? "Child-team member"
                            : "Member"
                          : team.membershipStatus === "pending"
                            ? "Pending"
                            : "Discoverable"}
                      </small>
                    </span>
                    <span aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
              {data.teams.length === 0 && <li className="empty-copy">目前沒有可查看的團隊。</li>}
            </ul>
          )}

          {data.organizationAccountId && (
            <div className="crud-create-row">
              <button
                type="button"
                className="secondary"
                onClick={() => setDraft({ action: "join", name: "", teamId: "" })}
              >
                申請加入既有團隊
              </button>
            </div>
          )}
        </section>

        {data.organizationAccountId && !data.team && (
          <section className="crud-guidance">
            <h2>選擇一個團隊</h2>
            <p>從列表開啟團隊，或建立新團隊、申請加入既有團隊。</p>
            {data.teams
              .filter((team) => team.membershipStatus === "pending")
              .map((team) => (
                <p key={team.id}>{team.name}：等待 TeamMaintainer 核准</p>
              ))}
          </section>
        )}

        {data.team && (
          <section className="crud-detail">
            <div className="crud-detail-head">
              <div>
                <span className="crud-kicker">Team 詳情</span>
                <h2>{data.team.name}</h2>
                {data.team.slug && data.organizationLogin && (
                  <p className={styles.meta}>
                    {buildNamespacePath("organization-team", {
                      organization: data.organizationLogin,
                      teamSlug: data.team.slug,
                    })}
                  </p>
                )}
                <p className={styles.meta}>Team ID：{data.team.id}</p>
                <p className={styles.meta}>
                  Privacy：{data.team.privacy} · Notifications：{data.team.notificationSetting}
                </p>
                {data.team.parentTeamId && (
                  <p className={styles.meta}>Parent Team：{data.team.parentTeamId}</p>
                )}
              </div>
              {maintainer && (
                <div className={styles.actions}>
                  <button
                    className="secondary"
                    onClick={() => setDraft({ action: "rename-team", name: data.team?.name ?? "" })}
                  >
                    重新命名
                  </button>
                  <button
                    className="secondary"
                    onClick={() =>
                      setDraft({
                        action: "settings",
                        privacy: data.team?.privacy ?? "SECRET",
                        notificationSetting:
                          data.team?.notificationSetting ?? "NOTIFICATIONS_DISABLED",
                      })
                    }
                  >
                    Team 設定
                  </button>
                  <button
                    className="secondary crud-back"
                    onClick={() =>
                      setDraft({
                        action: "parent-team",
                        parentTeamId: data.team?.parentTeamId ?? null,
                      })
                    }
                  >
                    Team 階層
                  </button>
                </div>
              )}
            </div>
            <p className="crud-lifecycle-note">
              Lifecycle：沒有 hard delete；可重新命名、管理成員／TeamMaintainer、Team
              privacy／notification setting 與 Organization 內 parent/child hierarchy。
            </p>
            {data.childTeams.length > 0 && (
              <>
                <h3>Child Teams</h3>
                <ul>
                  {data.childTeams.map((child) => (
                    <li key={child.id}>{child.name}</li>
                  ))}
                </ul>
              </>
            )}
            <h3>成員</h3>
            {data.members.map((member) => (
              <section key={member.userId}>
                <h3>{member.name}</h3>
                <p>
                  {member.status === "pending"
                    ? "待核准"
                    : member.status === "removed"
                      ? "已移除"
                      : member.isMaintainer
                        ? "TeamMaintainer"
                        : "成員"}
                </p>
                <p className={styles.meta}>{member.userId}</p>
                <div className={styles.actions}>
                  {maintainer && member.status === "pending" && (
                    <button
                      onClick={() =>
                        setDraft({
                          action: "membership",
                          targetUserId: member.userId,
                          status: "active",
                          title: `核准 ${member.name}`,
                        })
                      }
                    >
                      核准加入
                    </button>
                  )}
                  {maintainer && member.status === "active" && (
                    <button
                      className="secondary"
                      onClick={() =>
                        setDraft({
                          action: "maintainer",
                          targetUserId: member.userId,
                          enabled: !member.isMaintainer,
                          title: `${member.isMaintainer ? "撤銷" : "授予"} TeamMaintainer：${member.name}`,
                        })
                      }
                    >
                      {member.isMaintainer ? "撤銷 TeamMaintainer" : "設為 TeamMaintainer"}
                    </button>
                  )}
                  {(maintainer || member.userId === data.userId) && member.status !== "removed" && (
                    <button
                      className="secondary"
                      onClick={() =>
                        setDraft({
                          action: "membership",
                          targetUserId: member.userId,
                          status: "removed",
                          title: `${member.userId === data.userId ? "退出團隊" : "移除成員"}：${member.name}`,
                        })
                      }
                    >
                      {member.userId === data.userId ? "退出" : "移除／拒絕"}
                    </button>
                  )}
                </div>
              </section>
            ))}
          </section>
        )}

        {draft && (
          <form
            ref={editor}
            className={styles.editor}
            onSubmit={(event) => {
              event.preventDefault();
              void send(buildTeamCommand(data, draft));
            }}
          >
            <h2>{teamActionLabels[draft.action]}</h2>
            {(draft.action === "create-team" ||
              draft.action === "rename-team" ||
              draft.action === "join") && (
              <label>
                {draft.action === "join" ? "你的團隊稱呼" : "團隊名稱"}
                <input
                  required
                  maxLength={80}
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </label>
            )}
            {draft.action === "join" && (
              <label>
                團隊 ID
                <input
                  required
                  maxLength={128}
                  value={draft.teamId}
                  onChange={(event) => setDraft({ ...draft, teamId: event.target.value })}
                />
              </label>
            )}
            {draft.action === "parent-team" && (
              <label>
                Parent Team
                <select
                  value={draft.parentTeamId ?? ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      parentTeamId: event.target.value || null,
                    })
                  }
                >
                  <option value="">無 parent</option>
                  {data.teams
                    .filter((team) => team.id !== data.team?.id && team.isMaintainer)
                    .map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {draft.action === "settings" && (
              <>
                <label>
                  Privacy
                  <select
                    value={draft.privacy}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        privacy: event.target.value as typeof draft.privacy,
                      })
                    }
                  >
                    <option value="SECRET">SECRET</option>
                    <option value="VISIBLE">VISIBLE</option>
                  </select>
                </label>
                <label>
                  Notification setting
                  <select
                    value={draft.notificationSetting}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        notificationSetting: event.target.value as typeof draft.notificationSetting,
                      })
                    }
                  >
                    <option value="NOTIFICATIONS_DISABLED">NOTIFICATIONS_DISABLED</option>
                    <option value="NOTIFICATIONS_ENABLED">NOTIFICATIONS_ENABLED</option>
                  </select>
                </label>
              </>
            )}
            {(draft.action === "membership" || draft.action === "maintainer") && (
              <p>{draft.title}</p>
            )}
            <div className={styles.actions}>
              <button type="submit">{teamActionLabels[draft.action]}</button>
              <button type="button" className="secondary" onClick={() => setDraft(null)}>
                取消
              </button>
            </div>
          </form>
        )}
      </fieldset>
    </>
  );
}
