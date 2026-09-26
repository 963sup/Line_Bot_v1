"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { liffClient } from "../../../shared/browser/liff-client";
import MiniAppRuntime from "../../../shared/browser/mini-app-runtime";
import WorkNavigation from "../../_shell/work-navigation";
import ProfileShare from "./profile-share";
import { isOwnProfileLogin } from "./profile-viewer";
import styles from "./profile-viewer-shell.module.css";

type AccountProjection = {
  member?: {
    login?: string | null;
  } | null;
};

type OrganizationSummary = {
  actorMembershipStatus?: "active" | "removed" | null;
  actorIsOwner?: boolean;
};

type SelfResources = {
  organizations: string | null;
  starred: string | null;
};

async function loadSelfResources(token: string): Promise<SelfResources> {
  const headers = { "x-line-token": token };
  const [organizationsResult, starredResult] = await Promise.allSettled([
    fetch("/api/organization", { headers, cache: "no-store" }),
    fetch("/api/repositories/starred", { headers, cache: "no-store" }),
  ]);

  let organizations: string | null = null;
  if (organizationsResult.status === "fulfilled" && organizationsResult.value.ok) {
    const value = (await organizationsResult.value.json()) as {
      items?: OrganizationSummary[];
      next?: string | null;
    };
    if (Array.isArray(value.items)) {
      const count = value.items.filter(
        (item) => item.actorMembershipStatus === "active" || item.actorIsOwner === true,
      ).length;
      organizations = value.next ? `${count}+` : String(count);
    }
  }

  let starred: string | null = null;
  if (starredResult.status === "fulfilled" && starredResult.value.ok) {
    const value = (await starredResult.value.json()) as { items?: unknown[] };
    if (Array.isArray(value.items)) starred = String(value.items.length);
  }

  return { organizations, starred };
}

function ResourceRow({
  href,
  icon,
  tone,
  label,
  meta,
  disabled = false,
}: {
  href?: string;
  icon: string;
  tone: "neutral" | "orange" | "yellow";
  label: string;
  meta?: string | null;
  disabled?: boolean;
}) {
  const body = (
    <>
      <span
        className={`${styles.resourceIcon} ${styles[`resourceIcon${tone[0]!.toUpperCase()}${tone.slice(1)}`]}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className={styles.resourceLabel}>{label}</span>
      <span className={styles.resourceMeta}>{disabled ? "未開放" : (meta ?? "")}</span>
    </>
  );

  return href && !disabled ? (
    <Link className={styles.resourceRow} href={href}>
      {body}
    </Link>
  ) : (
    <div className={`${styles.resourceRow} ${styles.resourceRowDisabled}`} aria-disabled="true">
      {body}
    </div>
  );
}

function ProfileResources({
  ownProfile,
  repositoryCount,
  selfResources,
}: {
  ownProfile: boolean;
  repositoryCount: number;
  selfResources: SelfResources | null;
}) {
  return (
    <section className={styles.resources} aria-label="Profile resources">
      <div className={styles.resourceList}>
        <ResourceRow
          href={ownProfile ? "/repositories" : "#popular-repositories"}
          icon="▣"
          tone="neutral"
          label="Repositories"
          meta={String(repositoryCount)}
        />
        {ownProfile && (
          <>
            <ResourceRow
              href="/organizations"
              icon="▦"
              tone="orange"
              label="Organizations"
              meta={selfResources?.organizations}
            />
            <ResourceRow
              href="/home#favorites"
              icon="★"
              tone="yellow"
              label="Starred"
              meta={selfResources?.starred}
            />
            <ResourceRow icon="◇" tone="neutral" label="Projects" disabled />
          </>
        )}
      </div>
    </section>
  );
}

export default function ProfileViewerShell({
  children,
  liffId,
  profileLogin,
  repositoryCount,
}: {
  children: ReactNode;
  liffId: string;
  profileLogin: string;
  repositoryCount: number;
}) {
  const [ownProfile, setOwnProfile] = useState(false);
  const [selfResources, setSelfResources] = useState<SelfResources | null>(null);
  const generation = useRef(0);

  const clear = useCallback(() => {
    generation.current++;
    setOwnProfile(false);
    setSelfResources(null);
  }, []);

  const load = useCallback(async () => {
    const ticket = ++generation.current;
    try {
      const token = await liffClient.existingSession(liffId);
      if (!token || ticket !== generation.current) {
        setOwnProfile(false);
        setSelfResources(null);
        return;
      }
      const response = await fetch("/api/membership?view=account", {
        headers: { "x-line-token": token },
        cache: "no-store",
      });
      if (ticket !== generation.current || !response.ok) {
        setOwnProfile(false);
        setSelfResources(null);
        return;
      }
      const value = (await response.json()) as AccountProjection;
      const isOwnProfile = isOwnProfileLogin(value.member?.login, profileLogin);
      if (ticket !== generation.current) return;
      setOwnProfile(isOwnProfile);
      if (!isOwnProfile) {
        setSelfResources(null);
        return;
      }

      const resources = await loadSelfResources(token);
      if (ticket === generation.current) setSelfResources(resources);
    } catch {
      if (ticket === generation.current) {
        setOwnProfile(false);
        setSelfResources(null);
      }
    }
  }, [liffId, profileLogin]);

  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  const shellClassName = ownProfile ? `app-shell app-shell-tabs ${styles.shell}` : styles.shell;

  return (
    <div className={shellClassName}>
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} silent />
      <a className="skip-link" href="#main-content">
        跳至主要內容
      </a>
      <main id="main-content" className={`app-content ${styles.content}`}>
        <header className={styles.toolbar}>
          {ownProfile ? (
            <Link
              className={styles.toolbarAction}
              href="/home"
              aria-label="返回 Home"
              title="返回 Home"
            >
              <svg
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </Link>
          ) : (
            <span className={styles.toolbarSpacer} aria-hidden="true" />
          )}
          <div className={styles.toolbarActions}>
            <ProfileShare />
            {ownProfile && (
              <Link
                className="profile-settings-action"
                href="/settings"
                aria-label="Settings"
                title="Settings"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.12.38.34.73.64 1 .3.27.69.42 1.1.4H21v4h-.09a1.7 1.7 0 0 0-1.51.6Z" />
                </svg>
              </Link>
            )}
          </div>
        </header>
        {children}
        <ProfileResources
          ownProfile={ownProfile}
          repositoryCount={repositoryCount}
          selfResources={selfResources}
        />
      </main>
      {ownProfile && <WorkNavigation activeHref="/home" />}
    </div>
  );
}
