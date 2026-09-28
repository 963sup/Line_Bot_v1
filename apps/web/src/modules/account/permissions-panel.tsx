"use client";

import type { PermissionView } from "@line_bot_v1/identity-access/contracts/permissions";
import { type Permission, permissions } from "@line_bot_v1/identity-access/domain/permission";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { PageHeading } from "../../shared/ui/page-layout";
import { requestPermissions } from "./permission-operations";

const label = (permission: string) => permissions[permission as Permission] ?? permission;

export default function PermissionsPanel({ liffId }: { liffId: string }) {
  const [data, setData] = useState<PermissionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const reload = useRef(() => {});

  function clear() {
    generation.current++;
    setData(null);
    setBusy(false);
  }

  async function load() {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const proof = await liffClient.session(liffId);
      if (!proof) throw new Error("請完成 LINE 登入。");
      const value = await requestPermissions(proof);
      if (ticket !== generation.current) return;
      if ((await liffClient.session(liffId)) !== proof) {
        throw new Error("帳號已變更，請重新載入。");
      }
      if (!value.userId || !Array.isArray(value.own)) throw new Error("回應不完整。");
      setData(value);
    } catch (cause) {
      if (ticket === generation.current) {
        setData(null);
        setError(cause instanceof Error ? cause.message : "讀取失敗。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  reload.current = () => {
    void load();
  };
  const onVisibilityChange = useEffectEvent(() => {
    clear();
    if (document.visibilityState === "visible") reload.current();
  });
  useEffect(() => {
    const changed = () => onVisibilityChange();
    document.addEventListener("visibilitychange", changed);
    return () => {
      generation.current++;
      document.removeEventListener("visibilitychange", changed);
    };
  }, []);

  return (
    <>
      <PageHeading
        title="我的權限"
        back="/settings"
        description="查看目前有效的跨功能授權；資源 access 由各 owner 自己決定。"
      />
      <MiniAppRuntime liffId={liffId} onReady={() => load()} onWait={clear} />
      {busy && <p role="status">處理中…</p>}
      {error && <p role="alert">{error}</p>}
      {data && (
        <section aria-label="我的權限">
          {data.canManage && <p>你具有受控 permission administrator 資格。</p>}
          {!data.own.length && <p>目前沒有額外業務管理權限。</p>}
          <ul>
            {data.own.map((grant) => (
              <li key={grant.permission}>
                {label(grant.permission)}
                {!grant.effective && " · 已失效，需重新授予"}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
