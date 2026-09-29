"use client";

import { buildNamespacePath } from "@line_bot_v1/namespace";
import type { TeamCommand } from "@line_bot_v1/team/application/commands/team-command";
import type { TeamView } from "@line_bot_v1/team/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import styles from "./team.module.css";
import type { TeamDraft } from "./team-command";
import { teamActionLabels } from "./team-command";
import { TeamWorkspace } from "./team-workspace";

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
  const [draft, setDraft] = useState<TeamDraft | null>(null);
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
            buildNamespacePath("organization-team", {
              organization: value.organizationLogin,
              teamSlug: value.team.slug,
            }),
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
      setNotice(`${teamActionLabels[command.action]}已保存。`);
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
              buildNamespacePath("organization-team", {
                organization: fresh.organizationLogin,
                teamSlug: fresh.team.slug,
              }),
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

  return (
    <div className={`${styles.panel} crud-manager resource-workspace`}>
      <MiniAppRuntime liffId={liffId} onReady={async () => load()} onWait={clear} />
      <div className="crud-toolbar">
        <p>管理組織內的團隊與成員。</p>
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
        <TeamWorkspace
          data={data}
          draft={draft}
          setDraft={setDraft}
          busy={busy}
          pending={pending}
          send={send}
          editor={editor}
          selectOrganization={(organizationAccountId) => {
            selectedTeam.current = "";
            void load(organizationAccountId, "");
          }}
          selectTeam={(organizationAccountId, teamId) => {
            void load(organizationAccountId, teamId);
          }}
        />
      )}
    </div>
  );
}
