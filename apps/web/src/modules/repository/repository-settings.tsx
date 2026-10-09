"use client";

import type {
  RepositoryAddressCommand,
  RepositoryAddressReceipt,
  RepositoryAddressSnapshot,
} from "@line_bot_v1/repository/application/ports/address";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import GoogleMapPicker, { type MapPoint } from "./google-map-picker";

type PendingAddressOperation = Readonly<{
  owner: string;
  command: RepositoryAddressCommand;
}>;

function pendingKey(ownerLogin: string, repositoryName: string) {
  return `repository-address:${ownerLogin.toLowerCase()}/${repositoryName.toLowerCase()}`;
}

function restorePending(
  key: string,
  owner: string,
  repositoryId: string,
): PendingAddressOperation | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingAddressOperation;
    if (
      !value ||
      value.owner !== owner ||
      !value.command ||
      value.command.repositoryId !== repositoryId ||
      (value.command.action !== "set" && value.command.action !== "remove") ||
      typeof value.command.requestId !== "string" ||
      typeof value.command.repositoryId !== "string" ||
      !Number.isSafeInteger(value.command.expectedVersion) ||
      (value.command.action === "set" && !value.command.address)
    ) {
      throw new Error();
    }
    return value;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

function sameAddress(
  left: RepositoryAddressReceipt["address"] | undefined,
  right: RepositoryAddressReceipt["address"],
) {
  if (left === undefined) return false;
  if (left === null || right === null) return left === right;
  return (
    left.address === right.address &&
    left.latitude === right.latitude &&
    left.longitude === right.longitude &&
    left.radius === right.radius
  );
}

export default function RepositorySettings({
  liffId,
  mapsApiKey,
  ownerLogin,
  repositoryName,
}: {
  liffId: string;
  mapsApiKey: string;
  ownerLogin: string;
  repositoryName: string;
}) {
  const [data, setData] = useState<RepositoryAddressSnapshot | null>(null);
  const [pending, setPending] = useState<PendingAddressOperation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [point, setPoint] = useState<MapPoint | null>(null);
  const [address, setAddress] = useState("");
  const [radius, setRadius] = useState(100);
  const addressEdited = useRef(false);
  const generation = useRef(0);
  const locked = useRef(false);
  const storageKey = pendingKey(ownerLogin, repositoryName);

  function clear() {
    generation.current += 1;
    setData(null);
    setPending(null);
    setBusy(false);
    setError("");
    setNotice("");
    setPoint(null);
    setAddress("");
    setRadius(100);
    addressEdited.current = false;
  }

  async function session() {
    const token = await liffClient.ensureSession(liffId);
    if (!token) throw Object.assign(new Error("請完成 LINE 登入後重試。"), { status: 401 });
    return token;
  }

  async function requestView(token: string): Promise<RepositoryAddressSnapshot> {
    const query = new URLSearchParams({ owner: ownerLogin, name: repositoryName });
    const response = await fetch(`/api/repository-address?${query}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: { "X-App-Session-Generation": token },
    });
    const payload = (await response.json()) as RepositoryAddressSnapshot & { error?: string };
    if (!response.ok || !payload?.repository?.actorUserId) {
      throw Object.assign(new Error(payload.error ?? "Repository 地址讀取失敗。"), {
        status: response.status,
      });
    }
    return payload;
  }

  async function load(keepNotice = false) {
    if (locked.current) return;
    const ticket = ++generation.current;
    setBusy(true);
    setData(null);
    setPending(null);
    setError("");
    if (!keepNotice) setNotice("");
    try {
      const token = await session();
      const payload = await requestView(token);
      if (ticket !== generation.current) return;
      if ((await liffClient.ensureSession(liffId)) !== token) {
        throw new Error("LINE 身分已變更，請重新讀取。");
      }
      if (ticket !== generation.current) return;
      setData(payload);
      setPoint(
        payload.address
          ? { latitude: payload.address.latitude, longitude: payload.address.longitude }
          : null,
      );
      setAddress(payload.address?.address ?? "");
      setRadius(payload.address?.radius ?? 100);
      addressEdited.current = false;
      setPending(restorePending(storageKey, payload.repository.actorUserId, payload.repository.id));
    } catch (cause) {
      if (ticket === generation.current) {
        setData(null);
        setPending(null);
        setError(cause instanceof Error ? cause.message : "Repository 地址讀取失敗。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  const selectPoint = useCallback((next: MapPoint, suggestedAddress: string | null) => {
    setPoint(next);
    if (!addressEdited.current) setAddress(suggestedAddress ?? "");
  }, []);

  async function execute(operation: PendingAddressOperation) {
    if (locked.current) return;
    locked.current = true;
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    let success = false;
    try {
      const token = await session();
      const fresh = await requestView(token);
      if (ticket !== generation.current) return;
      if (
        fresh.repository.actorUserId !== operation.owner ||
        fresh.repository.id !== operation.command.repositoryId ||
        !fresh.repository.actorPermissions.includes("admin") ||
        (await liffClient.ensureSession(liffId)) !== token
      ) {
        sessionStorage.removeItem(storageKey);
        setPending(null);
        throw Object.assign(new Error("LINE 身分或 Repository 管理權限已變更，請重新讀取。"), {
          status: 403,
        });
      }
      if (ticket !== generation.current) return;
      sessionStorage.setItem(storageKey, JSON.stringify(operation));
      setPending(operation);
      const response = await fetch("/api/repository-address", {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "content-type": "application/json",
          "X-App-Session-Generation": token,
        },
        body: JSON.stringify(operation.command),
      });
      const payload = (await response.json()) as Partial<RepositoryAddressReceipt> & {
        error?: string;
      };
      if (ticket !== generation.current) return;
      if ((await liffClient.ensureSession(liffId)) !== token) {
        throw new Error("LINE 身分已變更；請重新讀取並確認原操作結果。");
      }
      if (ticket !== generation.current) return;
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) {
          sessionStorage.removeItem(storageKey);
          setPending(null);
        }
        throw Object.assign(new Error(payload.error ?? "Repository 地址更新失敗。"), {
          status: response.status,
        });
      }
      const expectedAddress =
        operation.command.action === "set" ? (operation.command.address ?? null) : null;
      if (
        payload.requestId !== operation.command.requestId ||
        payload.repositoryId !== operation.command.repositoryId ||
        !Number.isSafeInteger(payload.version) ||
        !Number.isFinite(payload.at) ||
        !sameAddress(payload.address, expectedAddress)
      ) {
        throw new Error("更新結果不完整，請重試原操作。");
      }
      sessionStorage.removeItem(storageKey);
      setPending(null);
      setNotice(operation.command.action === "set" ? "打卡點已更新。" : "打卡點已移除。");
      success = true;
    } catch (cause) {
      if (ticket === generation.current) {
        setData(null);
        setError(cause instanceof Error ? cause.message : "結果尚未確認，請重試原操作。");
      }
    } finally {
      locked.current = false;
      if (ticket === generation.current) setBusy(false);
      if (success) await load(true);
      else if (ticket !== generation.current && document.visibilityState === "visible") {
        await load();
      }
    }
  }

  const onVisibilityChange = useEffectEvent(() => {
    clear();
    if (document.visibilityState === "visible") void load();
  });
  const onPageHide = useEffectEvent(() => {
    clear();
  });
  useEffect(() => {
    const visibility = () => onVisibilityChange();
    const pagehide = () => onPageHide();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide);
    return () => {
      generation.current += 1;
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide);
    };
  }, []);

  return (
    <div className="crud-manager">
      <MiniAppRuntime liffId={liffId} onReady={() => load()} onWait={clear} />
      {busy && <p role="status">處理中…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {pending && !busy && (
        <section className="crud-guidance">
          <p>上一筆地址操作結果尚待確認；重試會沿用原操作。</p>
          <button type="button" onClick={() => void execute(pending)}>
            重試原操作
          </button>
        </section>
      )}
      {data && (
        <section className="crud-detail">
          <h2>
            {data.repository.ownerLogin}/{data.repository.name}
          </h2>
          <p>
            Repository 地址就是打卡點；你目前是
            {data.repository.actorIsOwner
              ? "擁有者"
              : data.repository.actorPermissions.includes("admin")
                ? "管理員"
                : "成員"}
            。
          </p>
          {data.repository.actorPermissions.includes("admin") ? (
            <form
              key={data.repository.version}
              onSubmit={(event) => {
                event.preventDefault();
                if (!point) {
                  setError("請先在地圖選擇打卡位置。");
                  return;
                }
                void execute({
                  owner: data.repository.actorUserId,
                  command: {
                    action: "set",
                    requestId: crypto.randomUUID(),
                    repositoryId: data.repository.id,
                    expectedVersion: data.repository.version,
                    address: {
                      address: address.trim(),
                      latitude: point.latitude,
                      longitude: point.longitude,
                      radius,
                    },
                  },
                });
              }}
            >
              {mapsApiKey ? (
                <GoogleMapPicker
                  apiKey={mapsApiKey}
                  point={point}
                  radius={radius}
                  disabled={busy || Boolean(pending)}
                  onChange={selectPoint}
                />
              ) : (
                <p role="alert">Google Maps 尚未設定，暫時無法選擇新的打卡位置。</p>
              )}
              <label>
                地址
                <input
                  name="address"
                  required
                  maxLength={500}
                  value={address}
                  onChange={(event) => {
                    addressEdited.current = true;
                    setAddress(event.currentTarget.value);
                  }}
                />
              </label>
              <label>
                打卡半徑（公尺）
                <input
                  name="radius"
                  type="number"
                  required
                  min={1}
                  max={10000}
                  step="any"
                  value={radius}
                  onChange={(event) => setRadius(Number(event.currentTarget.value))}
                />
              </label>
              <div className="repository-radius-choices" aria-label="常用打卡半徑">
                {[50, 100, 200].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="secondary"
                    disabled={busy || Boolean(pending)}
                    onClick={() => setRadius(value)}
                  >
                    {value} 公尺
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={busy || Boolean(pending) || !point || !address.trim()}
              >
                儲存打卡點
              </button>
              {data.address && (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || Boolean(pending)}
                  onClick={() =>
                    void execute({
                      owner: data.repository.actorUserId,
                      command: {
                        action: "remove",
                        requestId: crypto.randomUUID(),
                        repositoryId: data.repository.id,
                        expectedVersion: data.repository.version,
                      },
                    })
                  }
                >
                  移除打卡點
                </button>
              )}
            </form>
          ) : data.address ? (
            <p>
              {data.address.address} · {data.address.radius} 公尺
            </p>
          ) : (
            <p className="empty-copy">此 Repository 尚未設定打卡點。</p>
          )}
        </section>
      )}
    </div>
  );
}
