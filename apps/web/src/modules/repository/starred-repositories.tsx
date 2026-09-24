"use client";

import type { StarredRepository } from "@line-work/repository/application/ports/stars";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { repositoryPath } from "./resource-navigation";

export default function StarredRepositories({ liffId }: { liffId: string }) {
  const [items, setItems] = useState<StarredRepository[] | null>(null);
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
      const response = await fetch("/api/repositories/starred", {
        headers: { "x-line-token": token },
        cache: "no-store",
      });
      const value = (await response.json()) as { items?: StarredRepository[]; error?: string };
      if (!response.ok || !Array.isArray(value.items)) {
        throw new Error(value.error ?? "收藏的儲存庫暫不可用。");
      }
      if (ticket === generation.current) setItems(value.items);
    } catch (cause) {
      if (ticket === generation.current) {
        setItems(null);
        setError(cause instanceof Error ? cause.message : "收藏的儲存庫暫不可用。");
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
            <Link
              className="action-row"
              key={item.id}
              href={repositoryPath(item.ownerLogin, item.name)}
            >
              <span>
                <strong>
                  {item.ownerLogin}/{item.name}
                </strong>
                <small>
                  {item.visibility} · {item.starCount} Stars
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
