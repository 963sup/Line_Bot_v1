"use client";

import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { useProjectCollection } from "./use-project-collection";

export default function ProjectList({ liffId }: { liffId: string }) {
  const { items, busy, error, load, clear } = useProjectCollection(liffId);

  return (
    <div className="repository-list resource-workspace">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      <div className="crud-toolbar">
        <p>你可存取的專案</p>
        <button
          type="button"
          className="secondary crud-refresh"
          disabled={busy}
          onClick={() => void load()}
        >
          重新載入
        </button>
      </div>
      {busy && <p role="status">正在讀取 Project…</p>}
      {error && <p role="alert">{error}</p>}
      {!busy && !error && items?.length === 0 && (
        <p className="empty-copy">目前沒有可存取的 Project。</p>
      )}
      {items && items.length > 0 && (
        <div className="resource-project-list">
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
