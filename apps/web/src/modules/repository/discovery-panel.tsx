"use client";

import type {
  RepositoryActivityItem,
  TrendingRepository,
} from "@line-work/repository/application/ports/discovery";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { SectionHeading } from "../../shared/ui/page-layout";
import { repositoryIssuePath, repositoryPath } from "./resource-navigation";

type DiscoverySnapshot = {
  items: TrendingRepository[];
  activity: RepositoryActivityItem[];
};

function activityVerb(action: string) {
  switch (action) {
    case "create":
      return "created an issue";
    case "accept":
      return "accepted an issue";
    case "report":
      return "reported an issue";
    case "reject":
      return "rejected an issue";
    case "approve":
      return "approved an issue";
    default:
      return "updated an issue";
  }
}

function relativeAge(at: number) {
  const elapsed = Math.max(0, Date.now() - at);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function DiscoveryPanel({ liffId }: { liffId: string }) {
  const [snapshot, setSnapshot] = useState<DiscoverySnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0);

  function clear() {
    generation.current++;
    setSnapshot(null);
    setBusy(false);
    setError("");
    setNotice("");
  }

  async function read(token: string): Promise<DiscoverySnapshot> {
    const response = await fetch("/api/repositories/explore", {
      headers: { "x-line-token": token },
      cache: "no-store",
    });
    const value = (await response.json()) as {
      items?: TrendingRepository[];
      activity?: RepositoryActivityItem[];
      error?: string;
    };
    if (!response.ok || !Array.isArray(value.items) || !Array.isArray(value.activity)) {
      throw new Error(value.error ?? "儲存庫探索暫不可用。");
    }
    return { items: value.items, activity: value.activity };
  }

  async function load() {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const token = await liffClient.session(liffId);
      if (!token) throw new Error("請完成 LINE 登入後重試。");
      const value = await read(token);
      if (ticket !== generation.current) return;
      setSnapshot(value);
    } catch (cause) {
      if (ticket === generation.current) {
        setSnapshot(null);
        setError(cause instanceof Error ? cause.message : "儲存庫探索暫不可用。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  async function toggle(item: TrendingRepository) {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const token = await liffClient.session(liffId);
      if (!token) throw new Error("請完成 LINE 登入後重試。");
      const response = await fetch("/api/repositories/explore", {
        method: "POST",
        headers: {
          "x-line-token": token,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: item.starred ? "unstar" : "star",
          repositoryId: item.id,
        }),
      });
      const value = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(value.error ?? "儲存庫 Star 操作失敗。");
      if ((await liffClient.session(liffId)) !== token || ticket !== generation.current) return;
      setSnapshot(await read(token));
      setNotice(item.starred ? "已取消 Star。" : "已加入 Star。");
    } catch (cause) {
      if (ticket === generation.current) {
        setError(cause instanceof Error ? cause.message : "儲存庫 Star 操作失敗。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  const onVisibilityChange = useEffectEvent(() => {
    if (document.visibilityState === "hidden") clear();
    else void load();
  });

  useEffect(() => {
    const visibility = () => onVisibilityChange();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      generation.current++;
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  const items = snapshot?.items;
  const activity = snapshot?.activity;

  return (
    <div className="discovery-panel">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      <p className="discovery-boundary">
        只顯示目前有權存取的 Repository；Star 是個人關注訊號，不會增加 Repository 權限。
      </p>
      {busy && <p role="status">正在更新 Explore…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}

      <div id="trending" className="explore-section">
        <SectionHeading
          title="Trending Repositories"
          description="最近 7 天仍有效的 Star 優先；沒有近期訊號時再以總 Star 數排序。"
        />
        {items?.length === 0 && (
          <p className="empty-copy">目前沒有可探索的 Repository。取得存取權後會出現在這裡。</p>
        )}
        {items && items.length > 0 && (
          <div className="discovery-list">
            {items.map((item) => (
              <article className="discovery-item" key={item.id}>
                <div className="discovery-copy">
                  <Link
                    className="discovery-repository-link"
                    href={repositoryPath(item.ownerLogin, item.name)}
                  >
                    {item.ownerLogin}/{item.name}
                  </Link>
                  <div className="discovery-meta">
                    <span>{item.visibility}</span>
                    <span>{item.recentStarCount} recent Stars</span>
                    <span>{item.starCount} Stars</span>
                  </div>
                </div>
                <div className="discovery-actions">
                  <button
                    type="button"
                    className={item.starred ? "secondary" : undefined}
                    disabled={busy}
                    onClick={() => void toggle(item)}
                  >
                    {item.starred ? "Starred" : "Star"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="explore-section">
        <SectionHeading
          title="Activity"
          description="目前只投影仍可存取 Repository 的 durable Issue lifecycle evidence。"
        />
        {activity?.length === 0 && (
          <p className="empty-copy">目前沒有可顯示的 Repository activity。</p>
        )}
        {activity && activity.length > 0 && (
          <div className="explore-activity-list">
            {activity.map((item) => (
              <Link
                className="explore-activity-item"
                key={item.id}
                href={repositoryIssuePath(
                  item.repository.ownerLogin,
                  item.repository.name,
                  item.issue.number,
                )}
              >
                <div className="explore-activity-header">
                  <span className="explore-activity-avatar" aria-hidden="true">
                    {item.actorLogin.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="explore-activity-copy">
                    <strong>{item.actorLogin}</strong> {activityVerb(item.action)}
                  </span>
                  <time
                    className="explore-activity-time"
                    dateTime={new Date(item.occurredAt).toISOString()}
                  >
                    {relativeAge(item.occurredAt)}
                  </time>
                </div>
                <div className="explore-activity-preview">
                  <small>
                    {item.repository.ownerLogin}/{item.repository.name} · Issue #{item.issue.number}
                  </small>
                  <strong>{item.issue.title}</strong>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
