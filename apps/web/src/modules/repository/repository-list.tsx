"use client";

import Link from "next/link";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { repositoryPath } from "./resource-navigation";
import { useRepositoryCollection } from "./use-repository-collection";

export default function RepositoryList({ liffId }: { liffId: string }) {
  const { items, busy, error, load, clear } = useRepositoryCollection(liffId);

  return (
    <div className="repository-list">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      {busy && <p role="status">正在讀取 Repository…</p>}
      {error && <p role="alert">{error}</p>}
      {!busy && !error && items?.length === 0 && (
        <p className="empty-copy">目前沒有可存取的 Repository。</p>
      )}
      {items && items.length > 0 && (
        <div className="menu-group">
          {items.map((item) => (
            <Link
              className="action-row"
              key={item.id}
              href={repositoryPath(item.ownerLogin, item.name)}
            >
              <span className="action-row-copy">
                <strong>
                  {item.ownerLogin}/{item.name}
                </strong>
                <small>{item.capability}</small>
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
