"use client";

import {
  type NotificationPage,
  parseNotificationDto,
  parseNotificationPage,
} from "@line_bot_v1/notifications/contracts/dto/notification";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { PageHeading, PageState } from "../../shared/ui/page-layout";

function responseField(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result: unknown = Reflect.get(value, key);
  return result;
}

function responseError(value: unknown, fallback: string) {
  const error = responseField(value, "error");
  return typeof error === "string" && error ? error : fallback;
}

export default function Inbox({
  liffId,
  notificationId,
  view = "all",
}: {
  liffId: string;
  notificationId?: string;
  view?: "all" | "unread";
}) {
  const [page, setPage] = useState<NotificationPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);

  async function load() {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const token = await liffClient.ensureSession(liffId);
      if (!token || ticket !== generation.current) return;
      const query = new URLSearchParams();
      if (notificationId) query.set("id", notificationId);
      if (!notificationId && view === "unread") query.set("unread", "1");
      const response = await fetch(`/api/notifications${query.size ? `?${query}` : ""}`, {
        headers: { "X-App-Session-Generation": token },
        cache: "no-store",
      });
      const value: unknown = await response.json();
      if (!response.ok) throw new Error(responseError(value, "通知讀取失敗。"));
      const nextPage = parseNotificationPage(value);
      if (nextPage === null) throw new Error("通知回應格式不正確。");
      if (ticket === generation.current) setPage(nextPage);
    } catch (cause) {
      if (ticket === generation.current) {
        setPage(null);
        setError(cause instanceof Error ? cause.message : "通知讀取失敗。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  async function markRead(id: string) {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const token = await liffClient.ensureSession(liffId);
      if (!token || ticket !== generation.current) return;
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: {
          "X-App-Session-Generation": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });
      const value: unknown = await response.json();
      if (!response.ok) throw new Error(responseError(value, "通知狀態更新失敗。"));
      const notification = parseNotificationDto(responseField(value, "notification"));
      if (notification === null) throw new Error("通知狀態回應格式不正確。");
      if (ticket === generation.current) {
        setPage((current) =>
          current
            ? {
                items: current.items.map((item) => (item.id === id ? notification : item)),
              }
            : current,
        );
      }
    } catch (cause) {
      if (ticket === generation.current) {
        setError(cause instanceof Error ? cause.message : "通知狀態更新失敗。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  const selected = notificationId ? page?.items[0] : undefined;

  return (
    <>
      <PageHeading title="Inbox" />
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={() => setBusy(false)} />
      {notificationId ? (
        <Link
          className="back-link"
          href={view === "unread" ? "/notifications?notificationView=unread" : "/notifications"}
        >
          ← 返回通知列表
        </Link>
      ) : (
        <nav className="notification-filters" aria-label="通知檢視">
          <span className="notification-filter-disabled" aria-disabled="true">
            Focused
          </span>
          <Link
            href="/notifications?notificationView=unread"
            aria-current={view === "unread" ? "page" : undefined}
          >
            Unread
          </Link>
          <span className="notification-filter-disabled" aria-disabled="true">
            Repository
          </span>
          <Link href="/notifications" aria-current={view === "all" ? "page" : undefined}>
            All
          </Link>
        </nav>
      )}
      {busy && <p role="status">正在更新通知…</p>}
      {error && (
        <PageState
          tone="error"
          title="通知載入失敗"
          action={
            <button type="button" className="secondary" disabled={busy} onClick={() => void load()}>
              重新載入
            </button>
          }
        >
          {error}
        </PageState>
      )}
      {!busy && !error && page && !page.items.length && (
        <PageState title="目前沒有通知">有新的工作狀態需要你注意時，會集中顯示在這裡。</PageState>
      )}
      {selected ? (
        <article className="notification-detail">
          <h2>{selected.title}</h2>
          <p>{selected.body}</p>
          <p>
            來源：{selected.sourceType} · {selected.sourceId} · v{selected.sourceVersion}
          </p>
          <time>{new Date(selected.createdAt).toLocaleString("zh-TW")}</time>
          {selected.readAt === null ? (
            <button type="button" disabled={busy} onClick={() => void markRead(selected.id)}>
              標示為已讀
            </button>
          ) : (
            <p>已讀</p>
          )}
        </article>
      ) : (
        <ul className="notification-list">
          {page?.items.map((item) => (
            <li key={item.id}>
              <Link
                className="notification-item"
                href={`/notifications/${encodeURIComponent(item.id)}${
                  view === "unread" ? "?notificationView=unread" : ""
                }`}
              >
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.body.slice(0, 120)}</small>
                </span>
                <span
                  className={
                    item.readAt === null ? "notification-state is-unread" : "notification-state"
                  }
                >
                  {item.readAt === null ? "未讀" : "已讀"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
