"use client";

import Link from "next/link";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { repositoryIssueCreatePath, repositoryPath } from "./resource-navigation";
import { useRepositoryCollection } from "./use-repository-collection";

export default function RepositoryList({
  liffId,
  intent,
}: {
  liffId: string;
  intent?: "create-issue";
}) {
  const { items, busy, error, load, clear } = useRepositoryCollection(liffId);
  const visibleItems =
    intent === "create-issue"
      ? items?.filter((item) => item.capability === "write" || item.capability === "admin")
      : items;

  return (
    <div className="repository-list">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      {busy && <p role="status">正在讀取 Repository…</p>}
      {error && <p role="alert">{error}</p>}
      {!busy && !error && visibleItems?.length === 0 && (
        <p className="empty-copy">
          {intent === "create-issue"
            ? "目前沒有可建立 Issue 的 Repository。"
            : "目前沒有可存取的 Repository。"}
        </p>
      )}
      {visibleItems && visibleItems.length > 0 && (
        <div className="menu-group">
          {visibleItems.map((item) => (
            <Link
              className="action-row"
              key={item.id}
              href={
                intent === "create-issue"
                  ? repositoryIssueCreatePath(item.ownerLogin, item.name)
                  : repositoryPath(item.ownerLogin, item.name)
              }
            >
              <span className="action-row-copy">
                <strong>
                  {item.ownerLogin}/{item.name}
                </strong>
                <small>
                  {intent === "create-issue"
                    ? `Create Issue · ${item.capability}`
                    : item.capability}
                </small>
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
