"use client";
import type { Workplace, WorkplaceCommand } from "@line-work/attendance/domain";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { PageHeading } from "../../shared/ui/page-layout";

type Data = {
  canCreate: boolean;
  memberId: string;
  sites: Workplace[];
  next: string | null;
  members: { id: string; status: string }[];
};
type Pending = { owner: string; command: WorkplaceCommand };
export default function WorkplacesPanel({ liffId }: { liffId: string }) {
  const [data, setData] = useState<Data | null>(null),
    [draft, setDraft] = useState<Workplace | null>(null);
  const [pending, setPending] = useState<Pending | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const generation = useRef(0),
    locked = useRef(false),
    selection = useRef(""),
    refresh = useRef(() => {});
  refresh.current = () => {
    void load(selection.current);
  };
  function clear() {
    generation.current++;
    setData(null);
    setDraft(null);
    setNotice("");
    setBusy(false);
  }
  const onVisibilityChange = useEffectEvent(() => {
    clear();
    if (document.visibilityState === "visible") refresh.current();
  });
  useEffect(() => {
    const changed = () => onVisibilityChange();
    document.addEventListener("visibilitychange", changed);
    return () => {
      generation.current++;
      document.removeEventListener("visibilitychange", changed);
    };
  }, []);
  async function request(path: string, body?: WorkplaceCommand, proof?: string) {
    const access = proof ?? (await liffClient.session(liffId));
    if (!access) throw new Error("請完成 LINE 登入。");
    const r = await fetch("/api/workplaces" + path, {
      method: body ? "POST" : "GET",
      cache: "no-store",
      headers: { "x-line-token": access, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const value = await r.json();
    if (!r.ok)
      throw Object.assign(new Error(value.error ?? "工作地點服務暫不可用。"), { status: r.status });
    return value;
  }
  async function load(id = "", after = "") {
    if (locked.current) return;
    const ticket = ++generation.current;
    setBusy(true);
    setData(null);
    setDraft(null);
    setError("");
    try {
      const value: Data = await request(
        "?id=" + encodeURIComponent(id) + "&after=" + encodeURIComponent(after),
      );
      if (ticket !== generation.current) return;
      if (
        !Array.isArray(value.sites) ||
        !Array.isArray(value.members) ||
        typeof value.memberId !== "string"
      )
        throw new Error("回應不完整，請重新載入。");
      selection.current = id;
      setData(value);
      setDraft(id ? (value.sites[0] ?? null) : null);
      setPending((p) => (p && p.owner === value.memberId ? p : null));
    } catch (e) {
      if (ticket === generation.current) setError(e instanceof Error ? e.message : "讀取失敗。");
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }
  async function save(c: WorkplaceCommand, owner = data?.memberId) {
    if (locked.current || !owner) return;
    const ticket = ++generation.current;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const attempt = { owner, command: c };
    setPending(attempt);
    let reload = false;
    try {
      const proof = await liffClient.session(liffId);
      if (!proof) throw new Error("請完成 LINE 登入。");
      const identity: Data = await request("", undefined, proof);
      if (ticket !== generation.current) return;
      if (identity.memberId !== owner) {
        setPending(null);
        setData(null);
        setDraft(null);
        throw new Error("帳號已變更，請重新載入。");
      }
      const result = await request("", c, proof);
      if (result.id !== c.id || !Number.isSafeInteger(result.version))
        throw new Error("回執不完整，請重試原操作。");
      if (ticket !== generation.current) return;
      setPending(null);
      selection.current = c.id;
      setNotice("已儲存。");
      reload = true;
    } catch (e) {
      if (ticket === generation.current) {
        const status = (e as { status?: number }).status;
        if (status && status < 500 && status !== 429) setPending(null);
        if (status === 401 || status === 403) {
          setData(null);
          setDraft(null);
        }
        setError(e instanceof Error ? e.message : "結果尚未確認，請重試原操作。");
      }
    } finally {
      locked.current = false;
      if (ticket === generation.current) setBusy(false);
      if (reload) await load(c.id);
      else if (ticket !== generation.current && document.visibilityState === "visible")
        await load(selection.current);
    }
  }
  const blocked = busy || !!pending;
  return (
    <>
      <PageHeading
        title="工作地點"
        back="/admin"
        description="設定打卡範圍，並加入可以打卡的會員。"
      />
      <MiniAppRuntime liffId={liffId} onReady={() => load()} onWait={clear} />
      {busy && <p role="status">處理中…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <button type="button" disabled={busy} onClick={() => load(selection.current)}>
        重新載入
      </button>
      {data && (
        <>
          {pending && (
            <section>
              <p>上次操作尚未確認，請重試原操作。</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => save(pending.command, pending.owner)}
              >
                重試原操作
              </button>
            </section>
          )}
          <button
            type="button"
            disabled={blocked || !data.canCreate}
            onClick={() => {
              selection.current = "";
              setDraft({
                id: crypto.randomUUID(),
                name: "",
                description: "",
                latitude: 0,
                longitude: 0,
                radius: 100,
                enabled: true,
                version: 0,
              });
            }}
          >
            新增地點
          </button>
          <button type="button" disabled={blocked} onClick={() => load()}>
            地點列表
          </button>
          {!draft && (
            <section>
              <h2>地點列表</h2>
              {data.sites.length === 0 ? (
                <p>尚無工作地點。</p>
              ) : (
                data.sites.map((s) => (
                  <p key={s.id}>
                    <button type="button" disabled={blocked} onClick={() => load(s.id)}>
                      {s.name} · {s.enabled ? "啟用" : "停用"}
                    </button>
                  </p>
                ))
              )}
              {data.next && (
                <button type="button" disabled={blocked} onClick={() => load("", data.next!)}>
                  下一頁
                </button>
              )}
            </section>
          )}
          {draft && (
            <>
              <form
                key={draft.id + ":" + draft.version}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void save({
                    action: "save",
                    id: draft.id,
                    requestId: crypto.randomUUID(),
                    expectedVersion: draft.version,
                    name: String(f.get("name")),
                    description: String(f.get("description")),
                    latitude: Number(f.get("latitude")),
                    longitude: Number(f.get("longitude")),
                    radius: Number(f.get("radius")),
                    enabled: f.get("enabled") === "on",
                  });
                }}
              >
                <fieldset disabled={blocked}>
                  <legend>{draft.version ? "編輯地點" : "新增地點"}</legend>
                  {draft.version > 0 && <p>地點編號：{draft.id}</p>}
                  <label>
                    地點名稱
                    <input name="name" required maxLength={100} defaultValue={draft.name} />
                  </label>
                  <label>
                    地址或位置說明
                    <textarea name="description" maxLength={500} defaultValue={draft.description} />
                  </label>
                  <label>
                    緯度
                    <input
                      name="latitude"
                      type="number"
                      step="any"
                      min="-90"
                      max="90"
                      required
                      defaultValue={draft.version ? draft.latitude : ""}
                    />
                  </label>
                  <label>
                    經度
                    <input
                      name="longitude"
                      type="number"
                      step="any"
                      min="-180"
                      max="180"
                      required
                      defaultValue={draft.version ? draft.longitude : ""}
                    />
                  </label>
                  <label>
                    半徑（公尺）
                    <input
                      name="radius"
                      type="number"
                      min="1"
                      max="10000"
                      required
                      defaultValue={draft.radius}
                    />
                  </label>
                  <label>
                    <input name="enabled" type="checkbox" defaultChecked={draft.enabled} />
                    啟用
                  </label>
                  <button type="submit">儲存地點</button>
                </fieldset>
              </form>
              {draft.version > 0 && (
                <section>
                  <h2>可以打卡的人員</h2>
                  <p>請人員從帳號設定提供會員編號；一位會員可加入多個地點。</p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const memberId = String(new FormData(e.currentTarget).get("memberId")).trim();
                      void save({
                        action: "member",
                        id: draft.id,
                        expectedVersion: draft.version,
                        requestId: crypto.randomUUID(),
                        memberId,
                        allowed: true,
                      });
                    }}
                  >
                    <fieldset disabled={blocked}>
                      <label>
                        會員編號
                        <input name="memberId" required maxLength={100} />
                      </label>
                      <button type="submit">加入人員</button>
                    </fieldset>
                  </form>
                  {data.members.length === 0 ? (
                    <p>尚未加入人員，此地點目前無人可以打卡。</p>
                  ) : (
                    <ul>
                      {data.members.map((m) => (
                        <li key={m.id}>
                          {m.id} · {m.status === "active" ? "有效會員" : "會員資格不可用"}{" "}
                          <button
                            type="button"
                            disabled={blocked}
                            onClick={() => {
                              if (window.confirm("確定移除此人員的打卡資格？"))
                                void save({
                                  action: "member",
                                  id: draft.id,
                                  expectedVersion: draft.version,
                                  requestId: crypto.randomUUID(),
                                  memberId: m.id,
                                  allowed: false,
                                });
                            }}
                          >
                            移除人員
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
