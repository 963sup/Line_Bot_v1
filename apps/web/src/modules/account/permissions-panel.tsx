"use client";
import type { PermissionView } from "@line-work/identity-access/contracts/permissions";
import {
  type Permission,
  type PermissionCommand,
  permissions,
} from "@line-work/identity-access/domain/permission";
import { useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { ActionRow, PageHeading } from "../../shared/ui/page-layout";

const storageKey = "permission-operation";
type Pending = { owner: string; command: PermissionCommand };
const label = (p: string) => permissions[p as Permission] ?? p;
const entries = [
  ["users.read", "/admin/members", "使用者管理"],
  ["workplaces.manage", "/admin/workplaces", "工作地點"],
  ["partners.manage", "/admin/groups", "合作夥伴管理"],
  ["partners.review", "/partners/referrals", "推薦審核"],
] as const;
export default function PermissionsPanel({
  liffId,
  manage = false,
  navigation = false,
}: {
  liffId: string;
  manage?: boolean;
  navigation?: boolean;
}) {
  const [data, setData] = useState<PermissionView | null>(null);
  const [target, setTarget] = useState("");
  const [permission, setPermission] = useState<Permission>("workplaces.manage");
  const [workplaceId, setWorkplaceId] = useState("");
  const [allSites, setAllSites] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0),
    locked = useRef(false),
    lastUser = useRef(""),
    selected = useRef(""),
    reload = useRef(() => {});
  function clear() {
    generation.current++;
    setData(null);
    setPending(null);
    setNotice("");
    setReason("");
    setTarget("");
    setWorkplaceId("");
    setConfirmed(false);
  }
  reload.current = () => {
    void load(selected.current);
  };
  useEffect(() => {
    const changed = () => {
      clear();
      if (document.visibilityState === "visible") reload.current();
    };
    document.addEventListener("visibilitychange", changed);
    return () => {
      generation.current++;
      document.removeEventListener("visibilitychange", changed);
    };
  }, []);
  async function request(proof: string, id = "", command?: PermissionCommand) {
    const response = await fetch("/api/permissions?target=" + encodeURIComponent(id), {
      method: command ? "POST" : "GET",
      cache: "no-store",
      headers: {
        "x-line-token": proof,
        ...(command ? { "Content-Type": "application/json" } : {}),
      },
      body: command ? JSON.stringify(command) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const value = await response.json();
    if (!response.ok)
      throw Object.assign(new Error(value.error ?? "權限服務暫不可用。"), {
        status: response.status,
      });
    return value;
  }
  async function load(id = "", keepNotice = false) {
    if (locked.current) return;
    const ticket = ++generation.current;
    setBusy(true);
    setData(null);
    setError("");
    if (!keepNotice) setNotice("");
    setConfirmed(false);
    try {
      const proof = await liffClient.session(liffId);
      if (!proof) throw new Error("請完成 LINE 登入。");
      const value: PermissionView = await request(proof, id);
      if (ticket !== generation.current) return;
      if ((await liffClient.session(liffId)) !== proof) throw new Error("帳號已變更，請重新載入。");
      if (ticket !== generation.current) return;
      if (!value.userId || !Array.isArray(value.own)) throw new Error("回應不完整。");
      const changed = lastUser.current && lastUser.current !== value.userId;
      lastUser.current = value.userId;
      selected.current = changed ? "" : id;
      if (!changed) setTarget(id);
      if (changed) {
        setTarget("");
        setWorkplaceId("");
        setReason("");
        setNotice("");
      }
      setData(changed ? { ...value, target: null, history: [], moreHistory: false } : value);
      const saved = sessionStorage.getItem(storageKey);
      const operation: Pending | null = saved ? JSON.parse(saved) : null;
      if (operation?.owner === value.userId) setPending(operation);
      else {
        sessionStorage.removeItem(storageKey);
        setPending(null);
      }
    } catch (e) {
      if (ticket === generation.current) {
        setData(null);
        setError(e instanceof Error ? e.message : "讀取失敗。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }
  async function save(operation: Pending) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const ticket = ++generation.current;
    let success = false;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(operation));
      setPending(operation);
      const proof = await liffClient.session(liffId);
      if (!proof) throw new Error("請完成 LINE 登入。");
      const fresh: PermissionView = await request(proof);
      if (ticket !== generation.current) return;
      if (
        fresh.userId !== operation.owner ||
        !fresh.canManage ||
        (await liffClient.session(liffId)) !== proof
      )
        throw Object.assign(new Error("身分或權限已變更，請重新載入。"), { status: 403 });
      if (ticket !== generation.current) return;
      const result = await request(proof, "", operation.command);
      if (result.requestId !== operation.command.requestId || !Number.isSafeInteger(result.version))
        throw new Error("回執不完整，請重試原操作。");
      sessionStorage.removeItem(storageKey);
      if (ticket !== generation.current) return;
      setPending(null);
      setReason("");
      setConfirmed(false);
      setNotice("權限已更新。");
      success = true;
    } catch (e) {
      if (ticket === generation.current) {
        const status = (e as { status?: number }).status;
        if (status && status < 500 && status !== 429) {
          sessionStorage.removeItem(storageKey);
          setPending(null);
        }
        setData(null);
        setError(e instanceof Error ? e.message : "結果尚未確認，請重試原操作。");
      }
    } finally {
      locked.current = false;
      if (ticket === generation.current) setBusy(false);
      if (success) await load(operation.command.target, true);
      else if (ticket !== generation.current && document.visibilityState === "visible")
        await load(selected.current);
    }
  }
  const blocked = busy || !!pending;
  return (
    <>
      <PageHeading
        title={navigation ? "管理後台" : manage ? "權限管理" : "我的權限"}
        back={manage ? "/admin" : "/settings"}
        description="權限按功能與範圍授予，所有操作由後端核驗。"
      />
      <MiniAppRuntime liffId={liffId} onReady={() => load()} onWait={clear} />
      {busy && <p role="status">處理中…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <button type="button" disabled={busy} onClick={() => load(selected.current)}>
        重新載入
      </button>
      {data && (
        <>
          {navigation && (
            <nav className="menu-group" aria-label="管理功能">
              {data.canManage && (
                <ActionRow
                  href="/admin/permissions"
                  title="權限管理"
                  description="授予與撤銷業務權限"
                />
              )}
              {entries
                .filter(([p]) => data.own.some((g) => g.permission === p && g.effective))
                .map(([p, href, title]) => (
                  <ActionRow key={p} href={href} title={title} description="依授權範圍管理" />
                ))}
              <ActionRow
                href="/settings/permissions"
                title="我的權限"
                description="查看功能與管理範圍"
              />
            </nav>
          )}
          {!navigation && (
            <section aria-label="我的權限">
              {data.canManage && (
                <p>權限管理員：可管理其他使用者的業務權限；任命權限管理員由可信操作者處理。</p>
              )}
              {!data.own.length && <p>目前沒有額外業務管理權限。</p>}
              <ul>
                {data.own.map((g) => (
                  <li key={g.permission + (g.workplaceId ?? "")}>
                    {label(g.permission)} · {g.workplaceName ?? "全部範圍"}
                    {!g.effective && " · 已失效，需重新授予"}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {manage && !data.canManage && (
            <p>你沒有權限管理資格。請由既有權限管理員處理；首次設定由可信操作者完成。</p>
          )}
          {manage && data.canManage && (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void load(target.trim());
                }}
              >
                <label>
                  使用者 ID
                  <input
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    required
                    maxLength={128}
                    disabled={blocked}
                  />
                </label>
                <button disabled={blocked}>查詢使用者權限</button>
              </form>
              {data.target && (
                <section>
                  <h2>使用者 {data.target.id}</h2>
                  <p>狀態：{data.target.status}</p>
                  <ul>
                    {data.target.grants.map((g) => (
                      <li key={g.permission + (g.workplaceId ?? "")}>
                        {label(g.permission)} · {g.workplaceName ?? "全部範圍"}
                        {g.workplaceId && `（${g.workplaceId}）`}
                        {!g.effective && " · 已失效"}
                      </li>
                    ))}
                  </ul>
                  {!data.target.grants.length && <p>尚無業務管理權限。</p>}
                  {data.target.id === data.userId ? (
                    <p>不能修改自己的業務權限，請由另一位權限管理員處理。</p>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!confirmed || !data.target) return;
                        void save({
                          owner: data.userId,
                          command: {
                            requestId: crypto.randomUUID(),
                            target: data.target.id,
                            permission,
                            workplaceId:
                              permission === "workplaces.manage" && !allSites
                                ? workplaceId.trim()
                                : null,
                            enabled,
                            expectedVersion: data.target.version,
                            reason,
                          },
                        });
                      }}
                    >
                      <fieldset disabled={blocked} onChange={() => setConfirmed(false)}>
                        <legend>變更業務權限</legend>
                        <label htmlFor="permission-kind">功能</label>
                        <select
                          id="permission-kind"
                          value={permission}
                          onChange={(e) => setPermission(e.target.value as Permission)}
                        >
                          {Object.entries(permissions).map(([key, name]) => (
                            <option key={key} value={key}>
                              {name}
                            </option>
                          ))}
                        </select>
                        {permission === "workplaces.manage" && (
                          <>
                            <label>
                              <input
                                type="checkbox"
                                checked={allSites}
                                onChange={(e) => setAllSites(e.target.checked)}
                              />
                              全部地點（包含新增地點）
                            </label>
                            {!allSites && (
                              <label>
                                指定地點編號
                                <input
                                  value={workplaceId}
                                  onChange={(e) => setWorkplaceId(e.target.value)}
                                  required
                                />
                              </label>
                            )}
                          </>
                        )}
                        <label htmlFor="permission-operation">操作</label>
                        <select
                          id="permission-operation"
                          value={enabled ? "grant" : "revoke"}
                          onChange={(e) => setEnabled(e.target.value === "grant")}
                        >
                          <option value="grant">授予</option>
                          <option value="revoke">撤銷</option>
                        </select>
                        <label>
                          原因
                          <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            required
                            maxLength={500}
                          />
                        </label>
                      </fieldset>
                      <p>
                        {enabled ? "授予" : "撤銷"} {data.target.id} 的「{label(permission)}
                        」；範圍：
                        {permission === "workplaces.manage" && !allSites
                          ? workplaceId || "尚未指定"
                          : "全部範圍"}
                        。授權持續至撤銷或使用者狀態變更。
                      </p>
                      <label>
                        <input
                          type="checkbox"
                          checked={confirmed}
                          disabled={blocked}
                          onChange={(e) => setConfirmed(e.target.checked)}
                        />
                        我已核對使用者、功能與範圍
                      </label>
                      <button disabled={blocked || !confirmed || !reason.trim()}>確認變更</button>
                    </form>
                  )}
                  <h2>最近授權紀錄</h2>
                  <ul>
                    {data.history.map((h) => (
                      <li key={h.actor + h.requestId}>
                        {new Date(h.at).toLocaleString()} · {h.enabled ? "授予" : "撤銷"}{" "}
                        {label(h.permission)} · {h.workplaceId ?? "全部範圍"} · {h.reason} · 操作者{" "}
                        {h.actor}
                      </li>
                    ))}
                  </ul>
                  {data.moreHistory && <p>顯示最近 20 筆，尚有較早紀錄。</p>}
                </section>
              )}
            </>
          )}
          {manage && pending && (
            <section>
              <p>上次操作結果尚未確認；請重試原操作。</p>
              <button disabled={busy} onClick={() => save(pending)}>
                重試原操作
              </button>
            </section>
          )}
        </>
      )}
    </>
  );
}
