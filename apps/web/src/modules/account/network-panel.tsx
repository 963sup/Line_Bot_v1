"use client";

import type { FollowItem } from "@line_bot_v1/account/contracts/output/follows";
import { readNetwork } from "@line_bot_v1/account/contracts/parse-profile-response";
import { buildNamespacePath } from "@line_bot_v1/namespace";
import { isRecord } from "@line_bot_v1/platform/validation";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { responseError } from "./wire-response";

type NetworkItem = FollowItem & { login: string | null };
type NetworkData = {
  followers: NetworkItem[];
  following: NetworkItem[];
};

function readNetworkItem(value: unknown, item: FollowItem): NetworkItem {
  if (
    !isRecord(value) ||
    (value.login !== undefined && value.login !== null && typeof value.login !== "string")
  ) {
    throw new Error("追蹤關係回應格式不正確。");
  }
  return { ...item, login: typeof value.login === "string" ? value.login : null };
}

function readNetworkWithLogins(value: unknown): NetworkData {
  const network = readNetwork(value);
  if (!isRecord(value)) {
    throw new Error("追蹤關係回應格式不正確。");
  }
  const rawFollowers = value.followers;
  const rawFollowing = value.following;
  if (!Array.isArray(rawFollowers) || !Array.isArray(rawFollowing)) {
    throw new Error("追蹤關係回應格式不正確。");
  }
  return {
    followers: network.followers.map((item, index) => readNetworkItem(rawFollowers[index], item)),
    following: network.following.map((item, index) => readNetworkItem(rawFollowing[index], item)),
  };
}

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
      headers: { "X-App-Session-Generation": token },
      cache: "no-store",
    });
    const value: unknown = await response.json();
    if (!response.ok) throw new Error(responseError(value, "追蹤關係讀取失敗。"));
    return readNetworkWithLogins(value);
  }

  async function load() {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const token = await liffClient.ensureSession(liffId);
      if (!token) throw new Error("請完成 LINE 登入後重試。");
      const value = await read(token);
      if (ticket !== generation.current) return;
      setData(value);
    } catch (cause) {
      if (ticket === generation.current) {
        setData(null);
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  async function mutate(
    action: "follow" | "unfollow",
    target: { targetLogin: string } | { targetUserId: string },
  ) {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const token = await liffClient.ensureSession(liffId);
      if (!token) throw new Error("請完成 LINE 登入後重試。");
      const response = await fetch("/api/follows", {
        method: "POST",
        headers: {
          "X-App-Session-Generation": token,
          "content-type": "application/json",
        },
        body: JSON.stringify({ action, ...target }),
      });
      const value: unknown = await response.json();
      if (!response.ok) throw new Error(responseError(value, "追蹤操作失敗。"));
      if ((await liffClient.ensureSession(liffId)) !== token || ticket !== generation.current)
        return;
      setData(await read(token));
      setNotice(action === "follow" ? "已追蹤使用者。" : "已取消追蹤。");
    } catch (cause) {
      if (ticket === generation.current) {
        setError(cause instanceof Error ? cause.message : String(cause));
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
    <div className="network-panel">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      <form
        className="network-follow-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const targetLogin = String(form.get("targetLogin") ?? "").trim();
          if (targetLogin) void mutate("follow", { targetLogin });
        }}
      >
        <label>
          登入名稱
          <input name="targetLogin" required maxLength={39} placeholder="輸入使用者 login" />
        </label>
        <button disabled={busy}>追蹤使用者</button>
      </form>
      {busy && <p role="status">正在更新追蹤關係…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {data && (
        <div className="relationship-grid">
          <section id="following">
            <h2>正在追蹤</h2>
            {data.following.length === 0 ? (
              <p className="empty-copy">尚未追蹤任何使用者。可從上方輸入 login 加入。</p>
            ) : (
              <ul className="relationship-list">
                {data.following.map((item) => (
                  <li key={item.userId}>
                    <span>
                      {item.login ? (
                        <Link href={buildNamespacePath("account", { login: item.login })}>
                          <strong>@{item.login}</strong>
                        </Link>
                      ) : (
                        <strong>使用者目前不可用</strong>
                      )}
                      <small>{date(item.followedAt)}</small>
                    </span>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => void mutate("unfollow", { targetUserId: item.userId })}
                    >
                      取消追蹤
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section id="followers">
            <h2>追蹤你的人</h2>
            {data.followers.length === 0 ? (
              <p className="empty-copy">目前沒有追蹤者。</p>
            ) : (
              <ul className="relationship-list">
                {data.followers.map((item) => (
                  <li key={item.userId}>
                    <span>
                      {item.login ? (
                        <Link href={buildNamespacePath("account", { login: item.login })}>
                          <strong>@{item.login}</strong>
                        </Link>
                      ) : (
                        <strong>使用者目前不可用</strong>
                      )}
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
