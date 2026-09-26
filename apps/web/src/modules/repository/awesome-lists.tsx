"use client";

import type { RepositoryStarListDiscovery } from "@line-work/repository/application/ports/discovery";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { repositoryPath, repositoryStarListPath } from "./resource-navigation";

export default function AwesomeLists({ liffId }: { liffId: string }) {
  const [items, setItems] = useState<RepositoryStarListDiscovery[] | null>(null);
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
      const response = await fetch("/api/repositories/lists/discover", {
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: { "x-line-token": token },
      });
      const payload = (await response.json()) as {
        items?: RepositoryStarListDiscovery[];
        error?: string;
      };
      if (!response.ok || !Array.isArray(payload.items)) {
        throw new Error(payload.error ?? "Awesome Lists 暫不可用。");
      }
      if ((await liffClient.session(liffId)) !== token || ticket !== generation.current) return;
      setItems(payload.items);
    } catch (cause) {
      if (ticket === generation.current) {
        setItems(null);
        setError(cause instanceof Error ? cause.message : "Awesome Lists 暫不可用。");
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
    <div className="discovery-panel">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      <p className="discovery-boundary">
        Awesome Lists 是 public Repository Star Lists 的探索投影；只顯示你當下可見的
        Repository 與對應數量。
      </p>
      {busy && <p role="status">正在讀取 Awesome Lists…</p>}
      {error && <p role="alert">{error}</p>}
      {!busy && !error && items?.length === 0 && (
        <p className="empty-copy">目前沒有包含可見 Repository 的 public List。</p>
      )}
      {items && items.length > 0 && (
        <div className="discovery-list">
          {items.map((item) => (
            <article className="discovery-item star-list-card" key={item.id}>
              <div className="discovery-copy">
                <Link
                  className="discovery-repository-link"
                  href={repositoryStarListPath(item.id)}
                >
                  {item.name}
                </Link>
                <p>@{item.ownerLogin}</p>
                {item.description && <p>{item.description}</p>}
                <div className="discovery-meta">
                  <span>{item.visibleRepositoryCount} visible repositories</span>
                </div>
                {item.repositories.length > 0 && (
                  <div className="star-list-preview">
                    {item.repositories.map((repository) => (
                      <Link
                        key={repository.id}
                        href={repositoryPath(repository.ownerLogin, repository.name)}
                      >
                        {repository.ownerLogin}/{repository.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
