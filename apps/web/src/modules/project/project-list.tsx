"use client";

import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { useProjectCollection } from "./use-project-collection";

export default function ProjectList({ liffId }: { liffId: string }) {
  const { items, busy, error, load, clear } = useProjectCollection(liffId);

  return (
    <div className="repository-list">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      {busy && <p role="status">正在讀取 Project…</p>}
      {error && <p role="alert">{error}</p>}
      {!busy && !error && items?.length === 0 && (
        <p className="empty-copy">目前沒有可存取的 Project。</p>
      )}
      {items && items.length > 0 && (
        <div className="menu-group">
          {items.map((item) => (
            <div className="action-row" key={item.id}>
              <span className="action-row-copy">
                <strong>{item.name}</strong>
                <small>
                  {item.ownerLogin} · {item.ownerKind === "USER" ? "Personal" : "Organization"}
                </small>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
