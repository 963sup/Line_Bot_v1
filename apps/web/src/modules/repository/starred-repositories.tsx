"use client";

import type { StarredRepository } from "@line_bot_v1/repository/contracts/repositories/stars";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { ActionRow } from "../../shared/ui/page-layout";
import { repositoryPath } from "./resource-navigation";
import { errorMessage, isRecord, isStarredRepository } from "./response-validation";

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
      const token = await liffClient.ensureSession(liffId);
      if (!token) throw new Error("請完成 LINE 登入後重試。");
      const response = await fetch("/api/repositories/starred", {
        headers: { "X-App-Session-Generation": token },
        cache: "no-store",
      });
      const value: unknown = await response.json();
      if (
        !response.ok ||
        !isRecord(value) ||
        !Array.isArray(value.items) ||
        !value.items.every(isStarredRepository)
      ) {
        throw new Error(errorMessage(value, "收藏的儲存庫暫不可用。"));
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
