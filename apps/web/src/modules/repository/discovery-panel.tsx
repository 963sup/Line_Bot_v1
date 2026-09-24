"use client";

import type { ExploreRepository } from "@line-work/repository/application/ports/stars";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";

export default function DiscoveryPanel({ liffId }: { liffId: string }) {
  const [items, setItems] = useState<ExploreRepository[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0);

  function clear() {
    generation.current++;
    setItems(null);
    setBusy(false);
    setError("");
    setNotice("");
  }

  async function read(token: string) {
    const response = await fetch("/api/repositories/explore", {
      headers: { "x-line-token": token },
      cache: "no-store",
    });
    const value = (await response.json()) as { items?: ExploreRepository[]; error?: string };
    if (!response.ok || !Array.isArray(value.items)) {
      throw new Error(value.error ?? "儲存庫探索暫不可用。");
    }
    return value.items;
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
      setItems(value);
    } catch (cause) {
      if (ticket === generation.current) {
        setItems(null);
        setError(cause instanceof Error ? cause.message : "儲存庫探索暫不可用。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  async function toggle(item: ExploreRepository) {
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
      setItems(await read(token));
      setNotice(item.starred ? "已取消 Star。" : "已加入 Star。");
    } catch (cause) {
      if (ticket === generation.current) {
        setError(cause instanceof Error ? cause.message : "儲存庫 Star 操作失敗。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  useEffect(() => {
    const visibility = () => (document.visibilityState === "hidden" ? clear() : void load());
    document.addEventListener("visibilitychange", visibility);
    return () => {
      generation.current++;
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  return (
    <div className="discovery-panel">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      <p className="discovery-boundary">
        只顯示你目前有權存取的儲存庫；Star 是個人標記，不會增加儲存庫權限。
      </p>
      {busy && <p role="status">正在更新儲存庫…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {items?.length === 0 && (
        <p className="empty-copy">目前沒有可探索的儲存庫。取得存取權後會出現在這裡。</p>
      )}
      {items && items.length > 0 && (
        <div className="discovery-list">
          {items.map((item) => (
            <article className="discovery-item" key={item.id}>
              <div className="discovery-copy">
                <h2>{item.name}</h2>
                <p>{item.id}</p>
                <div className="discovery-meta">
                  <span>{item.capability}</span>
                  <span>{item.visibility}</span>
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
                  {item.starred ? "取消 Star" : "Star"}
                </button>
                <Link
                  className="secondary-link"
                  href={`/repositories?repository=${encodeURIComponent(item.id)}`}
                >
                  開啟儲存庫
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
