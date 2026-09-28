"use client";

import type { Workplace, WorkplaceCommand } from "@line_bot_v1/attendance/domain";
import type { RepositorySummary } from "@line_bot_v1/repository/domain";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { PageHeading } from "../../shared/ui/page-layout";

type Data = {
  userId: string;
  canCreate: boolean;
  sites: Workplace[];
  next: string | null;
};
type Pending = { owner: string; command: WorkplaceCommand };
const pendingKey = (repositoryId: string) => `attendance-location:${repositoryId}`;

export default function WorkplacesPanel({
  liffId,
  ownerLogin,
  repositoryName,
  backHref,
}: {
  liffId: string;
  ownerLogin: string;
  repositoryName: string;
  backHref: string;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [repository, setRepository] = useState<RepositorySummary | null>(null);
  const [draft, setDraft] = useState<Workplace | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const locked = useRef(false);
  const reload = useRef(() => {});

  function clear() {
    generation.current++;
    setData(null);
    setRepository(null);
    setDraft(null);
    setPending(null);
    setNotice("");
    setBusy(false);
  }

  async function repositoryFor(token: string) {
    const response = await fetch("/api/repositories", {
      headers: { "x-line-token": token },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    const value = (await response.json()) as {
      items?: RepositorySummary[];
      error?: string;
    };
    if (!response.ok || !Array.isArray(value.items)) {
      throw Object.assign(new Error(value.error ?? "Repository 暫不可用。"), {
        status: response.status,
      });
    }
    const found = value.items.find(
      (item) =>
        item.ownerLogin.toLowerCase() === ownerLogin.toLowerCase() &&
        item.name.toLowerCase() === repositoryName.toLowerCase(),
    );
    if (!found)
      throw Object.assign(new Error("Repository 不存在或目前不可存取。"), { status: 404 });
    if (found.capability !== "admin") {
      throw Object.assign(new Error("需要此 Repository 的 admin 權限。"), { status: 403 });
    }
    return found;
  }

  async function readLocation(token: string, repositoryId: string): Promise<Data> {
    const response = await fetch(`/api/workplaces?id=${encodeURIComponent(repositoryId)}`, {
      headers: { "x-line-token": token },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    const value = (await response.json()) as Data & { error?: string };
    if (!response.ok) {
      throw Object.assign(new Error(value.error ?? "打卡點暫不可用。"), {
        status: response.status,
      });
    }
    if (!value.userId || !Array.isArray(value.sites)) {
      throw new Error("打卡點回應不完整。");
    }
    return value;
  }

  function restorePending(repositoryId: string, owner: string) {
    const key = pendingKey(repositoryId);
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    try {
      const operation = JSON.parse(raw) as Pending;
      if (
        operation.owner !== owner ||
        operation.command?.action !== "save" ||
        operation.command.id !== repositoryId
      ) {
        sessionStorage.removeItem(key);
        return null;
      }
      return operation;
    } catch {
      sessionStorage.removeItem(key);
      return null;
    }
  }

  async function load() {
    if (locked.current) return;
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const token = await liffClient.session(liffId);
      if (!token) throw new Error("請完成 LINE 登入。");
      const nextRepository = await repositoryFor(token);
      const value = await readLocation(token, nextRepository.id);
      if (ticket !== generation.current) return;
      if ((await liffClient.session(liffId)) !== token) {
        sessionStorage.removeItem(pendingKey(nextRepository.id));
        throw new Error("帳號已變更，請重新載入。");
      }
      const site = value.sites[0];
      setRepository(nextRepository);
      setData(value);
      setDraft(
        site ?? {
          id: nextRepository.id,
          name: nextRepository.name,
          description: "",
          latitude: 0,
          longitude: 0,
          radius: 100,
          enabled: false,
          version: 0,
        },
      );
      setPending(restorePending(nextRepository.id, value.userId));
    } catch (cause) {
      if (ticket === generation.current) {
        setData(null);
        setRepository(null);
        setDraft(null);
        setPending(null);
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

  async function save(operation: Pending) {
    if (locked.current || !repository) return;
    const ticket = ++generation.current;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const key = pendingKey(repository.id);
    let success = false;
    try {
      sessionStorage.setItem(key, JSON.stringify(operation));
      setPending(operation);
      const token = await liffClient.session(liffId);
      if (!token) throw new Error("請完成 LINE 登入。");
      const currentRepository = await repositoryFor(token);
      const fresh = await readLocation(token, currentRepository.id);
      if (
        ticket !== generation.current ||
        currentRepository.id !== operation.command.id ||
        fresh.userId !== operation.owner ||
        (await liffClient.session(liffId)) !== token
      ) {
        sessionStorage.removeItem(key);
        setPending(null);
        throw Object.assign(new Error("帳號或 Repository 權限已變更，請重新載入。"), {
          status: 403,
        });
      }
      const response = await fetch("/api/workplaces", {
        method: "POST",
        cache: "no-store",
        headers: {
          "x-line-token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(operation.command),
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) {
          sessionStorage.removeItem(key);
          setPending(null);
        }
        throw Object.assign(new Error(result.error ?? "保存結果尚未確認，請重試原操作。"), {
          status: response.status,
        });
      }
      if (
        result.id !== operation.command.id ||
        result.version !== operation.command.expectedVersion + 1
      ) {
        throw new Error("保存回執不完整，請重試原操作。");
      }
      sessionStorage.removeItem(key);
      setPending(null);
      setNotice("Repository 打卡點已更新。");
      success = true;
    } catch (cause) {
      if (ticket === generation.current) {
        setError(cause instanceof Error ? cause.message : "保存結果尚未確認，請重試原操作。");
      }
    } finally {
      locked.current = false;
      if (ticket === generation.current) setBusy(false);
      if (success) await load();
    }
  }

  const blocked = busy || Boolean(pending);
  return (
    <>
      <PageHeading
        title="Attendance Location"
        back={backHref}
        description="此 Repository 的打卡點；Repository access 決定誰可以在此打卡。"
      />
      <MiniAppRuntime liffId={liffId} onReady={() => load()} onWait={clear} />
      {busy && <p role="status">處理中…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {pending && (
        <section>
          <p>上一筆設定結果尚未確認；重試會沿用同一 request identity。</p>
          <button type="button" disabled={busy} onClick={() => void save(pending)}>
            重試原操作
          </button>
        </section>
      )}
      {data && repository && draft && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void save({
              owner: data.userId,
              command: {
                action: "save",
                id: repository.id,
                requestId: crypto.randomUUID(),
                expectedVersion: draft.version,
                name: String(form.get("name")),
                description: String(form.get("description")),
                latitude: Number(form.get("latitude")),
                longitude: Number(form.get("longitude")),
                radius: Number(form.get("radius")),
                enabled: form.get("enabled") === "on",
              },
            });
          }}
        >
          <fieldset disabled={blocked}>
            <legend>{draft.version ? "編輯打卡點" : "設定打卡點"}</legend>
            <p>
              Repository：{repository.ownerLogin}/{repository.name}
            </p>
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
              啟用打卡點
            </label>
            <button type="submit">儲存打卡點</button>
          </fieldset>
        </form>
      )}
    </>
  );
}
