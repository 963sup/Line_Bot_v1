"use client";

import type { RepositoryStarListSummary } from "@line-work/repository/application/ports/star-lists";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { repositoryStarListPath } from "./resource-navigation";

export default function RepositoryStarListCollection({ liffId }: { liffId: string }) {
  const [items, setItems] = useState<RepositoryStarListSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);

  function clear() {
    generation.current++;
    setItems(null);
    setBusy(false);
    setError("");
  }

  async function load() {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const token = await liffClient.session(liffId);
      if (!token) throw new Error("請完成 LINE 登入後重試。");
      const response = await fetch("/api/repositories/lists", {
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: { "x-line-token": token },
      });
      const payload = (await response.json()) as {
        items?: RepositoryStarListSummary[];
        error?: string;
      };
      if (!response.ok || !Array.isArray(payload.items)) {
        throw new Error(payload.error ?? "Lists 暫不可用。");
      }
      if ((await liffClient.session(liffId)) !== token || ticket !== generation.current) return;
      setItems(payload.items);
    } catch (cause) {
      if (ticket === generation.current) {
        setItems(null);
        setError(cause instanceof Error ? cause.message : "Lists 暫不可用。");
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

  return (
    <div className="crud-manager">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      {busy && <p role="status">正在讀取 Lists…</p>}
      {error && <p role="alert">{error}</p>}
      {!busy && !error && items?.length === 0 && (
        <p className="empty-copy">目前沒有 List。建立 List 後，可加入你已 Star 的 Repository。</p>
      )}
      {items && items.length > 0 && (
        <div className="menu-group">
          {items.map((item) => (
            <Link className="action-row" key={item.id} href={repositoryStarListPath(item.id)}>
              <span className="action-row-copy">
                <strong>{item.name}</strong>
                <small>
                  @{item.ownerLogin} · {item.visibility} · {item.visibleRepositoryCount}{" "}
                  repositories
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
