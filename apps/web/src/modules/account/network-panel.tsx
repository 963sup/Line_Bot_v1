"use client";

import type { FollowItem } from "@line-work/account/application/ports/follows";
import { useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";

type NetworkData = {
  followers: FollowItem[];
  following: FollowItem[];
};

const date = (value: number) =>
  new Date(value).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });

export default function NetworkPanel({ liffId }: { liffId: string }) {
  const [data, setData] = useState<NetworkData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0);

  function clear() {
    generation.current++;
    setData(null);
    setBusy(false);
    setError("");
    setNotice("");
  }

  async function read(token: string) {
    const response = await fetch("/api/follows", {
      headers: { "x-line-token": token },
      cache: "no-store",
    });
    const value = (await response.json()) as NetworkData & { error?: string };
    if (!response.ok) throw new Error(value.error ?? "追蹤關係讀取失敗。");
    return value;
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
      setData(value);
    } catch (cause) {
      if (ticket === generation.current) {
        setData(null);
        setError(cause instanceof Error ? cause.message : "追蹤關係讀取失敗。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  async function mutate(action: "follow" | "unfollow", targetUserId: string) {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const token = await liffClient.session(liffId);
      if (!token) throw new Error("請完成 LINE 登入後重試。");
      const response = await fetch("/api/follows", {
        method: "POST",
        headers: {
          "x-line-token": token,
          "content-type": "application/json",
        },
        body: JSON.stringify({ action, targetUserId }),
      });
      const value = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(value.error ?? "追蹤操作失敗。");
      if ((await liffClient.session(liffId)) !== token || ticket !== generation.current) return;
      setData(await read(token));
      setNotice(action === "follow" ? "已追蹤使用者。" : "已取消追蹤。");
    } catch (cause) {
      if (ticket === generation.current) {
        setError(cause instanceof Error ? cause.message : "追蹤操作失敗。");
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
    <div className="network-panel">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      <form
        className="network-follow-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const target = String(form.get("targetUserId") ?? "").trim();
          if (target) void mutate("follow", target);
        }}
      >
        <label>
          使用者 ID
          <input name="targetUserId" required maxLength={128} placeholder="輸入要追蹤的 User ID" />
        </label>
        <button disabled={busy}>追蹤使用者</button>
      </form>
      {busy && <p role="status">正在更新追蹤關係…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {data && (
        <div className="relationship-grid">
          <section>
            <h2>正在追蹤</h2>
            {data.following.length === 0 ? (
              <p className="empty-copy">尚未追蹤任何使用者。知道 User ID 後可從上方加入。</p>
            ) : (
              <ul className="relationship-list">
                {data.following.map((item) => (
                  <li key={item.userId}>
                    <span>
                      <strong>{item.userId}</strong>
                      <small>{date(item.followedAt)}</small>
                    </span>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => void mutate("unfollow", item.userId)}
                    >
                      取消追蹤
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2>追蹤你的人</h2>
            {data.followers.length === 0 ? (
              <p className="empty-copy">目前沒有追蹤者。</p>
            ) : (
              <ul className="relationship-list">
                {data.followers.map((item) => (
                  <li key={item.userId}>
                    <span>
                      <strong>{item.userId}</strong>
                      <small>{date(item.followedAt)}</small>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
