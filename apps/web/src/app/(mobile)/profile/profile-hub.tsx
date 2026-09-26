"use client";

import type { UserProfileActivity } from "@line-work/account/application/ports/profile-activity";
import type { UserProfile } from "@line-work/account/application/ports/profile";
import type { PopularPublicRepositoryList } from "@line-work/repository/application/ports/public";
import type { StarredRepository } from "@line-work/repository/application/ports/stars";
import type { RepositorySummary } from "@line-work/repository/domain";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { repositoryPath } from "../../../modules/repository/resource-navigation";
import { liffClient } from "../../../shared/browser/liff-client";
import MiniAppRuntime from "../../../shared/browser/mini-app-runtime";
import styles from "./profile-hub.module.css";

type AccountProjection = {
  member?: {
    id: string;
    login: string | null;
    status: string;
  } | null;
};

type OrganizationListProjection = {
  items: Array<{
    id: string;
    actorMembershipStatus: "active" | "removed" | null;
    actorIsOwner: boolean;
  }>;
  next: string | null;
};

type HubSnapshot = {
  login: string | null;
  profile: UserProfile | null;
  activity: UserProfileActivity | null;
  repositories: RepositorySummary[] | null;
  starred: StarredRepository[] | null;
  organizations: OrganizationListProjection | null;
  popular: PopularPublicRepositoryList | null;
  pictureUrl: string | null;
  partial: boolean;
};

type ResourceRowProps = {
  href?: string;
  icon: string;
  label: string;
  count: string;
  disabled?: boolean;
};

async function readJson<T>(url: string, token?: string): Promise<T> {
  const response = await fetch(url, {
    headers: token ? { "x-line-token": token } : undefined,
    cache: "no-store",
  });
  const value = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(value.error ?? "資料讀取失敗。");
  return value;
}

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

function ResourceRow({ href, icon, label, count, disabled = false }: ResourceRowProps) {
  const content = (
    <>
      <span className={styles.resourceIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.resourceLabel}>{label}</span>
      <span className={styles.resourceCount}>{count}</span>
    </>
  );
  return href && !disabled ? (
    <Link className={styles.resourceRow} href={href}>
      {content}
    </Link>
  ) : (
    <div
      className={[styles.resourceRow, styles.resourceRowDisabled].join(" ")}
      aria-disabled="true"
    >
      {content}
    </div>
  );
}

function dateLabel(value: string) {
  const date = new Date(value + "T00:00:00Z");
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("zh-TW", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(date);
}

export default function ProfileHub({ liffId }: { liffId: string }) {
  const [snapshot, setSnapshot] = useState<HubSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shareNotice, setShareNotice] = useState("");
  const generation = useRef(0);

  const clear = useCallback(() => {
    generation.current++;
    setSnapshot(null);
    setBusy(false);
    setError("");
    setShareNotice("");
  }, []);

  const load = useCallback(async () => {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const token = await liffClient.session(liffId);
      if (!token) return;
      const account = await readJson<AccountProjection>("/api/membership?view=account", token);
      if (!account.member) throw new Error("請先完成使用者註冊或恢復使用者資格。");

      const login = account.member.login;
      const results = await Promise.allSettled([
        readJson<{ profile?: UserProfile | null }>("/api/profile", token),
        readJson<{ activity?: UserProfileActivity }>("/api/profile/activity", token),
        readJson<{ items?: RepositorySummary[] }>("/api/repositories", token),
        readJson<{ items?: StarredRepository[] }>("/api/repositories/starred", token),
        readJson<OrganizationListProjection>("/api/organization", token),
        login
          ? readJson<PopularPublicRepositoryList>(
              "/api/repositories/public?owner=" + encodeURIComponent(login) + "&limit=6",
            )
          : Promise.resolve<PopularPublicRepositoryList | null>(null),
        liffClient.profile(),
      ] as const);
      if (ticket !== generation.current) return;

      const profileResult = settledValue(results[0]);
      const activityResult = settledValue(results[1]);
      const repositoriesResult = settledValue(results[2]);
      const starredResult = settledValue(results[3]);
      const organizationsResult = settledValue(results[4]);
      const popularResult = settledValue(results[5]);
      const providerProfile = settledValue(results[6]);
      const pictureUrl =
        providerProfile?.pictureUrl?.startsWith("https://") === true
          ? providerProfile.pictureUrl
          : null;

      setSnapshot({
        login,
        profile: profileResult?.profile ?? null,
        activity: activityResult?.activity ?? null,
        repositories: Array.isArray(repositoriesResult?.items) ? repositoriesResult.items : null,
        starred: Array.isArray(starredResult?.items) ? starredResult.items : null,
        organizations:
          organizationsResult && Array.isArray(organizationsResult.items)
            ? organizationsResult
            : null,
        popular: popularResult ?? null,
        pictureUrl,
        partial: results.some((result) => result.status === "rejected"),
      });
    } catch (cause) {
      if (ticket === generation.current) {
        setSnapshot(null);
        setError(cause instanceof Error ? cause.message : "Profile 暫不可用。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }, [liffId]);

  const onVisibilityChange = useCallback(() => {
    if (document.visibilityState === "hidden") clear();
    else void load();
  }, [clear, load]);

  useEffect(() => {
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      generation.current++;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [onVisibilityChange]);

  async function share() {
    if (!snapshot?.login) return;
    const url = new URL("/" + encodeURIComponent(snapshot.login), window.location.origin).href;
    setShareNotice("");
    try {
      if (navigator.share) {
        await navigator.share({ url });
        return;
      }
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setShareNotice("已複製公開 Profile 連結。");
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setShareNotice("目前無法分享這個 Profile。");
    }
  }

  const login = snapshot?.login;
  const displayName = snapshot?.profile?.displayName ?? (login ? "@" + login : "Profile");
  const initial = Array.from(displayName.trim())[0]?.toLocaleUpperCase("zh-TW") ?? "•";
  const ownedRepositories =
    snapshot?.repositories && login
      ? snapshot.repositories.filter((repository) => repository.ownerLogin === login)
      : null;
  const organizationCount = snapshot?.organizations
    ? snapshot.organizations.items.filter(
        (organization) =>
          organization.actorIsOwner || organization.actorMembershipStatus === "active",
      ).length
    : null;
  const organizationCountLabel =
    organizationCount === null
      ? "—"
      : snapshot?.organizations?.next
        ? String(organizationCount) + "+"
        : String(organizationCount);
  const achievements = snapshot?.activity?.achievements ?? [];
  const contributions = snapshot?.activity?.contributions ?? [];
  const contributionTotal = contributions.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className={styles.hub}>
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} silent />

      <header className={styles.toolbar}>
        <Link
          className={styles.toolbarAction}
          href="/home"
          aria-label="返回 Home"
          title="返回 Home"
        >
          ‹
        </Link>
        <div className={styles.toolbarActions}>
          <button
            type="button"
            className={styles.toolbarButton}
            disabled={!login}
            onClick={() => void share()}
            aria-label="分享 Profile"
            title="分享"
          >
            ⤴
          </button>
          <Link
            className={styles.toolbarAction}
            href="/settings"
            aria-label="Settings"
            title="Settings"
          >
            ⚙
          </Link>
        </div>
      </header>

      {busy && !snapshot && <p role="status">正在讀取 Profile…</p>}
      {error && <p role="alert">{error}</p>}
      {shareNotice && (
        <p className={styles.notice} role="status">
          {shareNotice}
        </p>
      )}
      {snapshot?.partial && (
        <p className={styles.notice} role="status">
          部分投影暫不可用；已保留可驗證的 Profile 資料。
        </p>
      )}

      {snapshot && (
        <>
          <section className={styles.identity} aria-label="Profile identity">
            <div className={styles.identityRow}>
              <div className={styles.avatar} aria-hidden="true">
                {snapshot.pictureUrl ? (
                  // LINE hosts the current presentation photo; it is not Account identity authority.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={snapshot.pictureUrl}
                    alt=""
                    width={104}
                    height={104}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  initial
                )}
              </div>
              <div className={styles.identityCopy}>
                <h1>{displayName}</h1>
                <p>{login ? "@" + login : "尚未設定 login"}</p>
              </div>
            </div>
            <Link className={styles.statusCard} href="/settings/profile">
              <span>{snapshot.profile?.bio || "Set your profile"}</span>
              <span aria-hidden="true">✎</span>
            </Link>
            <div className={styles.achievementStrip} aria-label="Achievements">
              <span className={styles.trophy} aria-hidden="true">
                ♜
              </span>
              {achievements.length > 0 ? (
                achievements.slice(0, 5).map((achievement) => (
                  <span
                    className={styles.achievement}
                    key={achievement.id}
                    title={achievement.description}
                    aria-label={achievement.name}
                  >
                    {Array.from(achievement.name.trim())[0]?.toLocaleUpperCase("zh-TW") ?? "★"}
                  </span>
                ))
              ) : (
                <span className={styles.achievementEmpty}>尚未取得成就</span>
              )}
            </div>
          </section>

          <section className={styles.section}>
            <h2>Popular</h2>
            {snapshot.popular === null ? (
              <p className={styles.empty}>Popular Repository 暫不可用。</p>
            ) : snapshot.popular.items.length === 0 ? (
              <p className={styles.empty}>目前沒有公開 Repository。</p>
            ) : (
              <div className={styles.repositoryRail}>
                {snapshot.popular.items.map((repository) => (
                  <Link
                    className={styles.repositoryCard}
                    key={repository.id}
                    href={repositoryPath(repository.ownerLogin, repository.name)}
                  >
                    <span>
                      <small>@{repository.ownerLogin}</small>
                      <strong>{repository.name}</strong>
                    </span>
                    <span className={styles.repositoryMeta}>★ {repository.starCount}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className={styles.resources} aria-label="Profile resources">
            <ResourceRow
              href="/repositories"
              icon="▣"
              label="Repositories"
              count={ownedRepositories === null ? "—" : String(ownedRepositories.length)}
            />
            <ResourceRow
              href="/organizations"
              icon="▦"
              label="Organizations"
              count={organizationCountLabel}
            />
            <ResourceRow
              href="/home#favorites"
              icon="★"
              label="Starred"
              count={snapshot.starred === null ? "—" : String(snapshot.starred.length)}
            />
            <ResourceRow icon="▤" label="Projects" count="未開放" disabled />
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Activity</h2>
              <span>{contributionTotal > 0 ? String(contributionTotal) + " contributions" : ""}</span>
            </div>
            {contributions.length === 0 ? (
              <p className={styles.empty}>目前沒有可顯示的動態。</p>
            ) : (
              <div className={styles.activityList}>
                {contributions.slice(0, 10).map((item) => (
                  <div className={styles.activityRow} key={item.day}>
                    <time dateTime={item.day}>{dateLabel(item.day)}</time>
                    <span>{item.count}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
