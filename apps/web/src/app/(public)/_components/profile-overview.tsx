"use client";

import type { UserAchievement } from "@line_bot_v1/account/contracts/output/achievements";
import type { UserProfile } from "@line_bot_v1/account/contracts/repositories/profile";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { liffClient } from "../../../shared/browser/liff-client";
import styles from "./profile-viewer-shell.module.css";

type ProviderProfile = Readonly<{
  displayName?: string;
  pictureUrl?: string;
  statusMessage?: string;
}>;
type Loadable<T> =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; value: T }
  | { state: "error" };
type ResourceKind = "repositories" | "organizations" | "starred" | "projects";
type ProfileResource = Readonly<{
  href: string;
  kind: ResourceKind;
  label: string;
  count?: ReactNode;
}>;

async function readJson<T>(path: string, token: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    headers: { "X-App-Session-Generation": token },
    cache: "no-store",
    signal,
  });
  const value = (await response.json()) as T;
  signal.throwIfAborted();
  if (!response.ok) throw new Error("private profile read failed");
  return value;
}

function initials(value: string) {
  return Array.from(value.trim())[0]?.toLocaleUpperCase("zh-TW") ?? "•";
}

function ResourceIcon({ kind }: { kind: ResourceKind }) {
  const paths = {
    repositories: "M5 4.5h12a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2V4.5ZM7 16h12M9 8h6",
    organizations:
      "M4 20V8h6v12M14 20V4h6v16M2 20h20M6.5 11h1M6.5 14h1M16.5 8h1M16.5 11h1M16.5 14h1",
    starred: "m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z",
    projects: "M4 4h16v16H4V4ZM4 9h16M9 9v11",
  } as const;
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
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

export default function ProfileOverview({
  children,
  profileBio,
  profileLogin,
  profileTitle,
  publicRepositoryCount,
  token,
}: {
  children: ReactNode;
  profileBio?: string | null;
  profileLogin: string;
  profileTitle: string;
  publicRepositoryCount?: ReactNode;
  token?: string;
}) {
  const [provider, setProvider] = useState<Loadable<ProviderProfile>>({ state: "idle" });
  const [profile, setProfile] = useState<Loadable<UserProfile | null>>({ state: "idle" });
  const [achievements, setAchievements] = useState<Loadable<UserAchievement[]>>({ state: "idle" });

  useEffect(() => {
    const controller = new AbortController();
    if (!token) {
      setProvider({ state: "idle" });
      setProfile({ state: "idle" });
      setAchievements({ state: "idle" });
      return () => controller.abort();
    }

    setProvider({ state: "loading" });
    setProfile({ state: "loading" });
    setAchievements({ state: "loading" });

    void liffClient.profile().then(
      (value) => {
        if (!controller.signal.aborted) setProvider({ state: "ready", value });
      },
      () => {
        if (!controller.signal.aborted) setProvider({ state: "error" });
      },
    );
    void readJson<{ profile?: UserProfile | null }>("/api/profile", token, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted)
          setProfile({ state: "ready", value: value.profile ?? null });
      },
      () => {
        if (!controller.signal.aborted) setProfile({ state: "error" });
      },
    );
    void readJson<{ items?: UserAchievement[] }>(
      "/api/profile/achievements",
      token,
      controller.signal,
    ).then(
      (value) => {
        if (!controller.signal.aborted)
          setAchievements({ state: "ready", value: value.items ?? [] });
      },
      () => {
        if (!controller.signal.aborted) setAchievements({ state: "error" });
      },
    );

    return () => controller.abort();
  }, [token]);

  const providerValue = token && provider.state === "ready" ? provider.value : null;
  const profileValue = token && profile.state === "ready" ? profile.value : null;
  const title = profileValue?.displayName ?? providerValue?.displayName ?? profileTitle;
  const bio = token && profile.state === "ready" ? profileValue?.bio : profileBio;
  const resources: readonly ProfileResource[] = [
    {
      href: "/repositories",
      kind: "repositories",
      label: "Repositories",
      count: publicRepositoryCount,
    },
    { href: "/organizations", kind: "organizations", label: "Organizations" },
    { href: "/stars", kind: "starred", label: "Starred" },
    { href: "/projects", kind: "projects", label: "Projects" },
  ];

  return (
    <>
      <section className={styles.identity} aria-label="Profile identity">
        <div className={styles.identityRow}>
          {providerValue?.pictureUrl?.startsWith("https://") ? (
            // LINE hosts this verified viewer's presentation image; Account remains identity authority.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.avatar}
              src={providerValue.pictureUrl}
              width={96}
              height={96}
              alt=""
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className={styles.avatarFallback} aria-hidden="true">
              {initials(title || profileLogin)}
            </span>
          )}
          <div className={styles.identityCopy}>
            <h1>{title || `@${profileLogin}`}</h1>
            {title !== profileLogin && <p>@{profileLogin}</p>}
          </div>
        </div>
        {bio ? <p className={styles.bio}>{bio}</p> : null}
        {token && profile.state === "error" ? (
          <p className={styles.privateError} role="status">
            私人 Profile 資訊目前不可用，公開內容仍可瀏覽。
          </p>
        ) : null}
        {token ? (
          provider.state === "loading" ? (
            <p className={styles.providerStatus} role="status">
              正在載入 LINE 狀態…
            </p>
          ) : provider.state === "error" ? (
            <p className={styles.providerStatus} role="status">
              LINE 顯示資訊目前不可用。
            </p>
          ) : (
            <p className={styles.providerStatus}>
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M8 14a4.5 4.5 0 0 0 8 0M8 9h1m6 0h1" />
              </svg>
              <span>{providerValue?.statusMessage?.trim() || "尚未設定 LINE 狀態。"}</span>
            </p>
          )
        ) : null}
      </section>

      {token ? (
        <section className={styles.selfAchievements} aria-labelledby="profile-achievements">
          <h2 id="profile-achievements" title="Achievements">
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="M8 3h8v5a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 5 4m7-6h4v2a4 4 0 0 1-5 4M12 12v6m-4 3h8m-6-3h4v3" />
            </svg>
            <span className={styles.srOnly}>Achievements</span>
          </h2>
          {achievements.state === "loading" ? (
            <p role="status">正在載入 Achievements…</p>
          ) : achievements.state === "error" ? (
            <p role="status">Achievements 目前不可用。</p>
          ) : achievements.state === "ready" && achievements.value.length > 0 ? (
            <div className={styles.achievementRail}>
              {achievements.value.map((achievement) => (
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
          ) : (
            <p>尚未取得成就。</p>
          )}
        </section>
      ) : null}

      {children}

      {token ? (
        <nav className={styles.selfResources} aria-label="你的 Profile 資源">
          {resources.map((resource) => (
            <Link href={resource.href} key={resource.kind}>
              <span className={styles.resourceIcon} data-kind={resource.kind} aria-hidden="true">
                <ResourceIcon kind={resource.kind} />
              </span>
              <span>{resource.label}</span>
              {resource.count === undefined ? null : (
                <span className={styles.resourceCount}>{resource.count}</span>
              )}
            </Link>
          ))}
        </nav>
      ) : null}
    </>
  );
}
