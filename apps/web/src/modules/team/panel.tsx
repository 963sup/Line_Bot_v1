"use client";

import type { TeamView } from "@line-work/team/contracts";
import type { TeamCommand } from "@line-work/team/domain";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import styles from "./team.module.css";

type Draft =
  | { action: "create-team"; name: string }
  | { action: "rename-team"; name: string }
  | { action: "join"; name: string; teamId: string }
  | {
      action: "membership";
      targetUserId: string;
      status: "active" | "removed";
      title: string;
    }
  | { action: "maintainer"; targetUserId: string; enabled: boolean; title: string };

const labels: Record<TeamCommand["action"], string> = {
  "create-team": "建立團隊",
  "rename-team": "重新命名團隊",
  join: "申請加入",
  membership: "確認成員變更",
  maintainer: "確認維護者變更",
};

export default function TeamPanel({
  liffId,
  initialOrganizationLogin,
  initialTeamSlug,
}: {
  liffId: string;
  initialOrganizationLogin?: string;
  initialTeamSlug?: string;
}) {
  const router = useRouter();
  const canonicalTeam = Boolean(initialOrganizationLogin && initialTeamSlug);
  const [data, setData] = useState<TeamView | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState<TeamCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const token = useRef("");
  const generation = useRef(0);
  const locked = useRef(false);
  const selectedOrganization = useRef("");
  const selectedTeam = useRef("");
  const routedLocator = useRef(
    initialOrganizationLogin && initialTeamSlug
      ? { organizationLogin: initialOrganizationLogin, teamSlug: initialTeamSlug }
      : null,
  );
  const refresh = useRef<() => void>(() => {});
  const editor = useRef<HTMLFormElement>(null);

  refresh.current = () => void load();

  useEffect(() => {
    const change = () => {
      if (document.visibilityState === "hidden") {
        generation.current++;
        setData(null);
        setDraft(null);
        setNotice("");
      } else {
        refresh.current();
      }
    };
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);

  useEffect(() => {
    if (!draft) return;
    editor.current?.scrollIntoView({ block: "center" });
    editor.current?.querySelector<HTMLInputElement>("input,textarea,button")?.focus();
  }, [draft]);

  function clear() {
    generation.current++;
    token.current = "";
    selectedOrganization.current = "";
    selectedTeam.current = "";
    routedLocator.current =
      initialOrganizationLogin && initialTeamSlug
        ? { organizationLogin: initialOrganizationLogin, teamSlug: initialTeamSlug }
        : null;
    setData(null);
    setDraft(null);
    setPending(null);
    setNotice("");
  }

  async function read(
    ticket: number,
    access: string,
    organizationAccountId: string,
    teamId: string,
  ) {
    const query = new URLSearchParams();
    if (organizationAccountId) {
      query.set("organizationAccountId", organizationAccountId);
      if (teamId) query.set("teamId", teamId);
    } else if (routedLocator.current) {
      query.set("organizationLogin", routedLocator.current.organizationLogin);
      query.set("teamSlug", routedLocator.current.teamSlug);
    }
    const response = await fetch(`/api/team?${query.toString()}`, {
      headers: { "x-line-token": access },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const value = await response.json();
    if (!response.ok) {
      if (ticket === generation.current && (response.status === 401 || response.status === 403))
        clear();
      throw new Error(value.error || "讀取失敗。");
    }
    if (
      !value ||
      typeof value.userId !== "string" ||
      !Array.isArray(value.organizations) ||
      !Array.isArray(value.teams)
    ) {
      throw new Error("回應不完整，請重新載入。");
    }
    return value as TeamView;
  }

  async function load(
    organizationAccountId = selectedOrganization.current,
    teamId = selectedTeam.current,
  ) {
    if (locked.current) return;
    const ticket = ++generation.current;
    setBusy(true);
    setData(null);
    setDraft(null);
    setError("");
    try {
      const access = await liffClient.session(liffId);
      if (ticket !== generation.current) return;
      if (!access) {
        clear();
        return;
      }
      if (token.current && token.current !== access) {
        setPending(null);
        setNotice("");
      }
      token.current = access;
      const value = await read(ticket, access, organizationAccountId, teamId);
      if (ticket !== generation.current) return;
      selectedOrganization.current = value.organizationAccountId ?? "";
      selectedTeam.current = value.team?.id ?? teamId;
      if (value.team) routedLocator.current = null;
      setData(value);
      if (canonicalTeam) {
        if (value.organizationLogin && value.team?.slug) {
          router.replace(
            `/organizations/${encodeURIComponent(value.organizationLogin)}/teams/${encodeURIComponent(
              value.team.slug,
            )}`,
          );
        } else {
          router.replace("/team");
        }
      }
    } catch (cause) {
      if (ticket === generation.current || !token.current) {
        setError(cause instanceof Error ? cause.message : "讀取失敗。");
      }
    } finally {
      if (ticket === generation.current || !token.current) setBusy(false);
    }
  }

  function buildCommand(value: Draft): TeamCommand {
    const context = {
      requestId: crypto.randomUUID(),
      organizationAccountId: data?.organizationAccountId ?? "",
    };
    if (value.action === "create-team") {
      return { ...context, action: value.action, name: value.name };
    }
    const existing = {
      ...context,
      teamId: value.action === "join" ? value.teamId : (data?.team?.id ?? ""),
      expectedVersion:
        value.action === "rename-team" ||
        value.action === "membership" ||
        value.action === "maintainer"
          ? (data?.team?.version ?? 0)
          : 0,
    };
    if (value.action === "rename-team" || value.action === "join") {
      return { ...existing, action: value.action, name: value.name };
    }
    if (value.action === "membership") {
      return {
        ...existing,
        action: value.action,
        targetUserId: value.targetUserId,
        status: value.status,
      };
    }
    return {
      ...existing,
      action: value.action,
      targetUserId: value.targetUserId,
      enabled: value.enabled,
    };
  }

  async function send(command: TeamCommand) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setPending(command);
    const ticket = generation.current;
    try {
      const access = await liffClient.session(liffId);
      if (ticket !== generation.current) return;
      if (!access || access !== token.current) {
        clear();
        throw new Error("登入狀態已變更，請重新載入。");
      }
      const response = await fetch("/api/team", {
        method: "POST",
        signal: AbortSignal.timeout(20_000),
        headers: { "x-line-token": access, "content-type": "application/json" },
        body: JSON.stringify(command),
      });
      const result = await response.json();
      if (ticket !== generation.current) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          clear();
          setError(result.error);
          return;
        }
        if (response.status < 500 && response.status !== 429) setPending(null);
        if (response.status === 409) {
          setData(null);
          setDraft(null);
        }
        throw new Error(result.error || "操作結果尚未確認，請重試原操作。");
      }
      setPending(null);
      setDraft(null);
      setNotice(`${labels[command.action]}已保存。`);
      const organizationAccountId = result.organizationAccountId as string;
      const teamId =
        command.action === "join" ||
        (command.action === "membership" &&
          command.targetUserId === data?.userId &&
          command.status === "removed")
          ? ""
          : (result.teamId as string);
      selectedOrganization.current = organizationAccountId;
      selectedTeam.current = teamId;
      const fresh = await read(ticket, access, organizationAccountId, teamId);
      if (ticket === generation.current) {
        setData(fresh);
        if (canonicalTeam) {
          if (fresh.organizationLogin && fresh.team?.slug) {
            router.replace(
              `/organizations/${encodeURIComponent(fresh.organizationLogin)}/teams/${encodeURIComponent(
                fresh.team.slug,
              )}`,
            );
          } else {
            router.replace("/team");
          }
        }
      }
    } catch (cause) {
      if (ticket === generation.current || !token.current) {
        setError(cause instanceof Error ? cause.message : "操作結果尚未確認，請重試原操作。");
      }
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  const maintainer = data?.team?.isMaintainer === true;

  return (
    <div className={`${styles.panel} crud-manager`}>
      <MiniAppRuntime liffId={liffId} onReady={async () => load()} onWait={clear} />
      <div className="crud-toolbar">
        <p>Team 一定屬於 Organization；先選 Organization，再建立或管理 Team。</p>
        <button
          className="secondary crud-refresh"
          disabled={busy || !!pending}
          onClick={() => void load()}
        >
          重新載入
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {pending && !busy && (
        <div className={styles.recovery}>
          <p>原操作結果尚待確認，請沿用同一筆請求重試。</p>
          <button onClick={() => void send(pending)}>重試原操作</button>
        </div>
      )}
      {busy && <p role="status">正在確認資料…</p>}
      {data && (
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
                  selectedTeam.current = "";
                  void load(event.target.value, "");
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
                    void load(data.organizationAccountId ?? "", event.target.value);
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
                    {(maintainer || member.userId === data.userId) &&
                      member.status !== "removed" && (
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
                void send(buildCommand(draft));
              }}
            >
              <h2>{labels[draft.action]}</h2>
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
                <button type="submit">{labels[draft.action]}</button>
                <button type="button" className="secondary" onClick={() => setDraft(null)}>
                  取消
                </button>
              </div>
            </form>
          )}
        </fieldset>
      )}
    </div>
  );
}
