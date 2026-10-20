"use client";

import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { ActionRow } from "../../shared/ui/page-layout";
import { repositoryPath } from "./resource-navigation";
import { useStarredRepositoryCollection } from "./use-repository-collection";

export default function StarredRepositories({ liffId }: { liffId: string }) {
  const { items, busy, error, load, clear } = useStarredRepositoryCollection(liffId);

  return (
    <div className="starred-repositories">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      {busy && <p role="status">正在讀取收藏…</p>}
      {error && <p role="alert">{error}</p>}
      {!busy && !error && items?.length === 0 && (
        <p className="empty-copy">目前沒有收藏的儲存庫；可從探索頁加入 Star。</p>
      )}
      {items && items.length > 0 && (
        <div className="menu-group">
          {items.map((item) => (
            <ActionRow
              key={item.id}
              href={repositoryPath(item.ownerLogin, item.name)}
              title={`${item.ownerLogin}/${item.name}`}
              description={`${item.visibility} · ${item.starCount} Stars`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
