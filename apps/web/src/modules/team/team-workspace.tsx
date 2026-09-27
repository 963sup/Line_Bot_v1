import type { TeamView } from "@line_bot_v1/team/contracts";
import type { TeamCommand } from "@line_bot_v1/team/domain";
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
              <h2>選擇 Organization 與 Team</h2>
              <p>Organization 決定 Team 的工作範圍；建立 Team 前必須先選 Organization。</p>
            </div>
            <button
              type="button"
              className="crud-create"
              disabled={!data.organizationAccountId}
              onClick={() => setDraft({ action: "create-team", name: "" })}
            >
              ＋ 建立團隊
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
            <label>
              團隊
              <select
                aria-label="團隊"
                value={data.team?.id ?? ""}
                onChange={(event) => {
                  setDraft(null);
                  selectTeam(data.organizationAccountId ?? "", event.target.value);
                }}
              >
                <option value="">選擇團隊</option>
                {data.teams
                  .filter((team) => team.membershipStatus === "active")
                  .map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
              </select>
            </label>
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
            <h2>尚未選擇 Team</h2>
            <p>你可以從上方選擇既有 Team、建立新 Team，或用 Team ID 申請加入。</p>
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
                    /organizations/{data.organizationLogin}/teams/{data.team.slug}
                  </p>
                )}
                <p className={styles.meta}>Team ID：{data.team.id}</p>
              </div>
              {maintainer && (
                <button
                  className="secondary crud-back"
                  onClick={() => setDraft({ action: "rename-team", name: data.team?.name ?? "" })}
                >
                  重新命名
                </button>
              )}
            </div>
            <p className="crud-lifecycle-note">
              Lifecycle：目前 Team contract 沒有 hard
              delete；可重新命名、管理成員／TeamMaintainer，或由成員退出。
            </p>
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
