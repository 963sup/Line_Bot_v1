"use client";

import type { RepositorySummary } from "@line-work/repository/domain";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { repositoryPath } from "./resource-navigation";

export default function RepositoryList({ liffId }: { liffId: string }) {
  const [items, setItems] = useState<RepositorySummary[] | null>(null);
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
      const response = await fetch("/api/repositories", {
        headers: { "x-line-token": token },
        cache: "no-store",
      });
      const value = (await response.json()) as { items?: RepositorySummary[]; error?: string };
      if (!response.ok || !Array.isArray(value.items)) {
        throw new Error(value.error ?? "Repository 列表暫不可用。");
      }
      if (ticket === generation.current) setItems(value.items);
    } catch (cause) {
      if (ticket === generation.current) {
        setItems(null);
        setError(cause instanceof Error ? cause.message : "Repository 列表暫不可用。");
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
