"use client";

import type { UserAchievement } from "@line-work/account/application/ports/achievements";
import type { UserProfile } from "@line-work/account/application/ports/profile";
import type { OrganizationList } from "@line-work/organization/contracts/organization-governance";
import type { TrendingRepository } from "@line-work/repository/application/ports/discovery";
import type { StarredRepository } from "@line-work/repository/application/ports/stars";
import type { RepositorySummary } from "@line-work/repository/domain";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { repositoryPath } from "../../../modules/repository/resource-navigation";
import { liffClient } from "../../../shared/browser/liff-client";
import MiniAppRuntime from "../../../shared/browser/mini-app-runtime";
import styles from "./profile-hub.module.css";

type ProviderProfile = {
  displayName?: string;
  pictureUrl?: string;
  statusMessage?: string;
};

type AccountProjection = {
  member?: {
    login?: string | null;
  } | null;
};

type Snapshot = {
  login: string | null;
  profile: UserProfile | null;
  provider: ProviderProfile | null;
  achievements: UserAchievement[];
  repositories: RepositorySummary[];
  starred: StarredRepository[];
  organizations: OrganizationList;
  trending: TrendingRepository[];
};

async function readJson<T>(path: string, token: string, fallback: string): Promise<T> {
  const response = await fetch(path, {
    headers: { "x-line-token": token },
    cache: "no-store",
  });
  const value = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(value.error ?? fallback);
  return value;
}

function initials(value: string) {
  return Array.from(value.trim())[0]?.toLocaleUpperCase("zh-TW") ?? "•";
}

function ResourceIcon({
  kind,
}: {
  kind: "repositories" | "organizations" | "starred" | "projects";
}) {
  const paths = {
    repositories: "M5 4.5h12a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2V4.5ZM7 16h12M9 8h6",
    organizations:
      "M4 20V8h6v12M14 20V4h6v16M2 20h20M6.5 11h1M6.5 14h1M16.5 8h1M16.5 11h1M16.5 14h1",
    starred: "m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z",
    projects: "M4 5h16v14H4V5Zm5 0v14M9 10h11",
  } as const;
  return (
    <svg
      viewBox="0 0 24 24"
      width="23"
      height="23"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
    </svg>
  );
}

export default function ProfileHub({ liffId }: { liffId: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
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
      if (!token || ticket !== generation.current) return;
      const [
        accountResult,
        profileResult,
        achievementResult,
        repositoryResult,
        starredResult,
        organizationResult,
        discoveryResult,
        provider,
      ] = await Promise.all([
        readJson<AccountProjection>("/api/membership?view=account", token, "Account 暫不可用。"),
        readJson<{ profile?: UserProfile | null }>("/api/profile", token, "Profile 暫不可用。"),
        readJson<{ items?: UserAchievement[] }>(
          "/api/profile/achievements",
          token,
          "Achievements 暫不可用。",
        ),
        readJson<{ items?: RepositorySummary[] }>(
          "/api/repositories",
          token,
          "Repositories 暫不可用。",
        ),
        readJson<{ items?: StarredRepository[] }>(
          "/api/repositories/starred",
          token,
          "Starred Repositories 暫不可用。",
        ),
        readJson<OrganizationList>("/api/organization", token, "Organizations 暫不可用。"),
        readJson<{ items?: TrendingRepository[] }>(
          "/api/repositories/explore",
          token,
          "Repository discovery 暫不可用。",
        ),
        liffClient.profile().catch(() => null),
      ]);
      if (ticket !== generation.current) return;
      setSnapshot({
        login: accountResult.member?.login ?? null,
        profile: profileResult.profile ?? null,
        provider: provider as ProviderProfile | null,
        achievements: achievementResult.items ?? [],
        repositories: repositoryResult.items ?? [],
        starred: starredResult.items ?? [],
        organizations: organizationResult,
        trending: discoveryResult.items ?? [],
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

  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  async function shareProfile() {
    if (!snapshot?.login) return;
    const url = new URL(`/${encodeURIComponent(snapshot.login)}`, window.location.origin).href;
    setShareNotice("");
    try {
      if (navigator.share) {
        await navigator.share({ url });
        return;
      }
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setShareNotice("已複製 Profile 連結。");
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setShareNotice("目前無法分享 Profile。");
    }
  }

  const login = snapshot?.login ?? null;
  const ownedRepositories =
    snapshot?.repositories.filter((item) => login && item.ownerLogin === login) ?? [];
  const popular =
    snapshot?.trending.filter((item) => login && item.ownerLogin === login).slice(0, 6) ?? [];
  const organizations =
    snapshot?.organizations.items.filter(
      (item) => item.actorIsOwner || item.actorMembershipStatus === "active",
    ) ?? [];
  const title =
    snapshot?.profile?.displayName ??
    snapshot?.provider?.displayName ??
    (login ? `@${login}` : "Profile");
  const providerStatus = snapshot?.provider?.statusMessage?.trim();

  return (
    <div className={styles.hub}>
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} silent />

      <header className={styles.toolbar}>
        <Link href="/home" className={styles.toolbarAction} aria-label="Back to Home" title="Back">
          <svg
            viewBox="0 0 24 24"
            width="25"
            height="25"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
        <div className={styles.toolbarActions}>
          <button
            type="button"
            className={styles.iconButton}
            disabled={!login}
            onClick={() => void shareProfile()}
            aria-label="Share Profile"
            title="Share"
          >
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <circle cx="18" cy="5" r="2.5" />
              <circle cx="6" cy="12" r="2.5" />
              <circle cx="18" cy="19" r="2.5" />
              <path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" />
            </svg>
          </button>
          <Link
            href="/settings"
            className={styles.toolbarAction}
            aria-label="Settings"
            title="Settings"
          >
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.12.38.34.73.64 1 .3.27.69.42 1.1.4H21v4h-.09a1.7 1.7 0 0 0-1.51.6Z" />
            </svg>
          </Link>
        </div>
      </header>

      {busy && !snapshot && (
        <p role="status" className={styles.state}>
          正在載入 Profile…
        </p>
      )}
      {error && (
        <p role="alert" className={styles.state}>
          {error}
        </p>
      )}
      {shareNotice && (
        <p role="status" className={styles.shareNotice}>
          {shareNotice}
        </p>
      )}

      {snapshot && (
        <>
          <div className={styles.identity} aria-label="Profile identity">
            {snapshot.provider?.pictureUrl?.startsWith("https://") ? (
              // LINE hosts the signed-in user's presentation image. It is not Account identity authority.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={styles.avatar}
                src={snapshot.provider.pictureUrl}
                width={104}
                height={104}
                alt=""
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className={styles.avatarFallback} aria-hidden="true">
                {initials(title)}
              </span>
            )}
            <div className={styles.identityCopy}>
              <h1>{title}</h1>
              <p>{login ? `@${login}` : "登入名稱尚未設定"}</p>
            </div>
          </div>

          {!login && (
            <Link className={styles.locatorRecovery} href="/settings/profile">
              設定登入名稱後即可使用 canonical Profile 連結
            </Link>
          )}

          <div className={styles.statusRow}>
            <span aria-hidden="true">☺</span>
            <span>{providerStatus || "Set your LINE status"}</span>
          </div>

          <div className={styles.achievements} aria-label="Achievements">
            <span className={styles.trophy} aria-hidden="true">
              ♜
            </span>
            {snapshot.achievements.length === 0 ? (
              <span className={styles.achievementEmpty}>尚未取得成就</span>
            ) : (
              <div className={styles.achievementRail}>
                {snapshot.achievements.map((achievement) => (
                  <span
                    className={styles.achievementBadge}
                    key={achievement.id}
                    title={`${achievement.name}: ${achievement.description}`}
                    aria-label={achievement.name}
                  >
                    {initials(achievement.name)}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className={styles.divider} />

          <div className={styles.popular} aria-labelledby="profile-popular">
            <h2 id="profile-popular">
              <span aria-hidden="true">☆</span>
              Popular
            </h2>
            {popular.length === 0 ? (
              <p className={styles.empty}>目前沒有可顯示的 Popular Repository。</p>
            ) : (
              <div className={styles.repositoryRail}>
                {popular.map((repository) => (
                  <Link
                    key={repository.id}
                    href={repositoryPath(repository.ownerLogin, repository.name)}
                    className={styles.repositoryCard}
                  >
                    <span className={styles.repositoryOwner}>@{repository.ownerLogin}</span>
                    <strong>{repository.name}</strong>
                    <span className={styles.repositoryMeta}>
                      <span aria-hidden="true">★</span>
                      {repository.starCount}
                      <span>·</span>
                      {repository.visibility}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <nav className={styles.resourceList} aria-label="Profile resources">
            <Link href="/repositories" className={styles.resourceRow}>
              <span className={styles.resourceIcon}>
                <ResourceIcon kind="repositories" />
              </span>
              <span>Repositories</span>
              <strong>{ownedRepositories.length}</strong>
            </Link>
            <Link href="/organizations" className={styles.resourceRow}>
              <span className={styles.resourceIcon}>
                <ResourceIcon kind="organizations" />
              </span>
              <span>Organizations</span>
              <strong>{organizations.length}</strong>
            </Link>
            <Link href="/home#favorites" className={styles.resourceRow}>
              <span className={styles.resourceIcon}>
                <ResourceIcon kind="starred" />
              </span>
              <span>Starred</span>
              <strong>{snapshot.starred.length}</strong>
            </Link>
            <span
              className={`${styles.resourceRow} ${styles.resourceDisabled}`}
              aria-disabled="true"
            >
              <span className={styles.resourceIcon}>
                <ResourceIcon kind="projects" />
              </span>
              <span>Projects</span>
              <strong>—</strong>
            </span>
          </nav>
        </>
      )}
    </div>
  );
}
