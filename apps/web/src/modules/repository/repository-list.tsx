"use client";

import Link from "next/link";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import styles from "./repository-list.module.css";
import {
  repositoryAccessPath,
  repositoryDiscussionsPath,
  repositoryIssueCreatePath,
  repositoryIssuesPath,
  repositoryPath,
  repositorySettingsPath,
} from "./resource-navigation";
import { useRepositoryCollection } from "./use-repository-collection";

function ownerInitials(ownerLogin: string) {
  const segments = ownerLogin.split(/[-_.]+/).filter(Boolean);
  const initials =
    segments.length > 1 ? segments.map((segment) => segment[0]).join("") : ownerLogin;
  return initials.slice(0, 2).toLocaleUpperCase();
}

export function RepositoryCollectionActions() {
  return (
    <>
      <Link href="/search" aria-label="Search repositories" title="Search repositories">
        <span aria-hidden="true">⌕</span>
      </Link>
      <details className={styles.actionMenu}>
        <summary aria-label="Repository actions" title="Repository actions">
          <span aria-hidden="true">⋯</span>
        </summary>
        <nav aria-label="Repository actions">
          <Link href="/repositories/new">New Repository</Link>
          <Link href="/repositories?intent=manage-access">Manage Access</Link>
          <Link href="/repositories?intent=manage-settings">Manage Settings</Link>
        </nav>
      </details>
    </>
  );
}

export default function RepositoryList({
  liffId,
  intent,
}: {
  liffId: string;
  intent?:
    | "create-issue"
    | "browse-issues"
    | "browse-discussions"
    | "manage-access"
    | "manage-settings";
}) {
  const { items, busy, error, load, clear } = useRepositoryCollection(liffId);
  const visibleItems =
    intent === "create-issue"
      ? items?.filter(
          (item) => item.permissions.includes("write") || item.permissions.includes("admin"),
        )
      : intent === "manage-access" || intent === "manage-settings"
        ? items?.filter((item) => item.permissions.includes("admin"))
        : items;

  const targetPath = (ownerLogin: string, name: string) => {
    if (intent === "create-issue") return repositoryIssueCreatePath(ownerLogin, name);
    if (intent === "browse-issues") return repositoryIssuesPath(ownerLogin, name);
    if (intent === "browse-discussions") return repositoryDiscussionsPath(ownerLogin, name);
    if (intent === "manage-access") return repositoryAccessPath(ownerLogin, name);
    if (intent === "manage-settings") return repositorySettingsPath(ownerLogin, name);
    return repositoryPath(ownerLogin, name);
  };

  return (
    <div className={`repository-list ${styles.collection}`}>
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      {busy && <p role="status">正在讀取 Repository…</p>}
      {error && <p role="alert">{error}</p>}
      {!busy && !error && visibleItems?.length === 0 && (
        <p className="empty-copy">
          {intent === "create-issue"
            ? "目前沒有可建立 Issue 的 Repository。"
            : intent === "manage-access" || intent === "manage-settings"
              ? "目前沒有可管理的 Repository。"
              : "目前沒有可存取的 Repository。"}
        </p>
      )}
      {visibleItems && visibleItems.length > 0 && (
        <div className={styles.list}>
          {visibleItems.map((item) => (
            <Link
              className={styles.row}
              key={item.id}
              href={targetPath(item.ownerLogin, item.name)}
              aria-label={`${item.ownerLogin}/${item.name}`}
            >
              <span className={styles.ownerMark} aria-hidden="true">
                {ownerInitials(item.ownerLogin)}
              </span>
              <span className={styles.copy}>
                <small className={styles.owner}>{item.ownerLogin}</small>
                <strong className={styles.name}>{item.name}</strong>
                {intent && (
                  <small className={styles.intent}>
                    {intent === "create-issue"
                      ? "Create Issue"
                      : intent === "browse-issues"
                        ? "Issues"
                        : intent === "browse-discussions"
                          ? "Discussions"
                          : intent === "manage-access"
                            ? "Manage Access"
                            : "Manage Settings"}
                  </small>
                )}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
