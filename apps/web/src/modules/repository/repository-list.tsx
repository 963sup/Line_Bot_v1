"use client";

import Link from "next/link";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import {
  repositoryAccessPath,
  repositoryDiscussionsPath,
  repositoryIssueCreatePath,
  repositoryIssuesPath,
  repositoryPath,
  repositorySettingsPath,
} from "./resource-navigation";
import { useRepositoryCollection } from "./use-repository-collection";

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
      ? items?.filter((item) => item.capability === "write" || item.capability === "admin")
      : intent === "manage-access" || intent === "manage-settings"
        ? items?.filter((item) => item.capability === "admin")
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
    <div className="repository-list">
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
        <div className="menu-group">
          {visibleItems.map((item) => (
            <Link
              className="action-row"
              key={item.id}
              href={targetPath(item.ownerLogin, item.name)}
            >
              <span className="action-row-copy">
                <strong>
                  {item.ownerLogin}/{item.name}
                </strong>
                {intent && (
                  <small>
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
              <span className="action-chevron" aria-hidden="true">
                ›
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
