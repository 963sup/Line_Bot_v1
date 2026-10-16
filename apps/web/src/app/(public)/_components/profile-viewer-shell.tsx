"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearCurrentAccount,
  ensureCurrentAccount,
} from "../../../modules/account/current-account";
import {
  clearVerifiedProfileEntry,
  readVerifiedProfileEntry,
} from "../../../modules/account/profile-entry-handoff";
import ProfileFollowControl from "../../../modules/account/profile-follow-control";
import MiniAppRuntime from "../../../shared/browser/mini-app-runtime";
import AppShell from "../../_shell/app-shell";
import ProfileOverview from "./profile-overview";
import ProfileShare from "./profile-share";
import { isVerifiedSelfUser } from "./profile-viewer";
import styles from "./profile-viewer-shell.module.css";

export default function ProfileViewerShell({
  children,
  liffId,
  profileKind,
  profileBio,
  profileLogin,
  profileTitle,
  profileUserId,
  publicRepositoryCount,
  publicStatus,
}: {
  children: ReactNode;
  liffId: string;
  profileKind: "USER" | "ORGANIZATION";
  profileBio?: string | null;
  profileLogin: string;
  profileTitle: string;
  profileUserId?: string;
  publicRepositoryCount?: ReactNode;
  publicStatus?: ReactNode;
}) {
  const [viewer, setViewer] = useState<{
    member: { id: string; login: string; status: "active" };
    token: string;
  } | null>(null);
  const generation = useRef(0);
  const ownProfile = Boolean(
    profileUserId && isVerifiedSelfUser(viewer?.member, profileUserId, profileLogin, profileKind),
  );

  const clear = useCallback(() => {
    generation.current++;
    clearCurrentAccount();
    clearVerifiedProfileEntry();
    setViewer(null);
  }, []);

  const load = useCallback(async () => {
    const ticket = ++generation.current;
    const handoff =
      profileKind === "USER" && profileUserId
        ? readVerifiedProfileEntry(profileUserId, profileLogin)
        : null;
    if (handoff) {
      clearVerifiedProfileEntry();
      setViewer({
        member: { id: handoff.userId, login: handoff.login, status: "active" },
        token: handoff.token,
      });
      return;
    }
    setViewer(null);
    try {
      const current = await ensureCurrentAccount(liffId);
      if (!current || ticket !== generation.current) return;
      setViewer(
        current.member?.status === "active"
          ? {
              member: {
                id: current.member.id,
                login: current.member.login,
                status: current.member.status,
              },
              token: current.token,
            }
          : null,
      );
    } catch {
      if (ticket === generation.current) setViewer(null);
    }
  }, [liffId, profileKind, profileLogin, profileUserId]);

  useEffect(
    () => () => {
      generation.current++;
      clearCurrentAccount();
      clearVerifiedProfileEntry();
    },
    [],
  );

  return (
    <>
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} silent />
      <AppShell
        className={styles.shell ?? ""}
        contentClassName={styles.content ?? ""}
        showNavigation={ownProfile}
        activeHref="/home"
      >
        <header className={styles.toolbar}>
          {ownProfile ? (
            <Link
              className={`${styles.toolbarAction} ${styles.toolbarBack}`}
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
                <path d="M20 12H4m7-7-7 7 7 7" />
              </svg>
            </Link>
          ) : (
            <span className={styles.toolbarSpacer} aria-hidden="true" />
          )}
          <div className={styles.toolbarActions}>
            <ProfileShare />
            {ownProfile && (
              <Link
                className={styles.toolbarAction}
                href="/settings"
                aria-label="Settings"
                title="Settings"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="26"
                  height="26"
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
        {profileKind === "USER" && profileUserId && viewer && !ownProfile ? (
          <ProfileFollowControl
            key={`${viewer.token}:${profileUserId}`}
            token={viewer.token}
            targetUserId={profileUserId}
          />
        ) : null}
        <ProfileOverview
          key={`${profileKind}:${profileUserId ?? ""}:${profileLogin}:${ownProfile ? viewer?.token : "public"}`}
          {...(profileBio !== undefined ? { profileBio } : {})}
          profileLogin={profileLogin}
          profileTitle={profileTitle}
          {...(publicRepositoryCount !== undefined ? { publicRepositoryCount } : {})}
          {...(publicStatus !== undefined ? { publicStatus } : {})}
          {...(ownProfile && viewer ? { token: viewer.token } : {})}
        >
          {children}
        </ProfileOverview>
      </AppShell>
    </>
  );
}
