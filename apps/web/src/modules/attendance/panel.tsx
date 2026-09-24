"use client";
import type { AttendanceView, Workplace } from "@line-work/attendance/domain";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { authHeaders } from "../../shared/browser/supabase-session";
import {
  type AttendanceOperation,
  isAttendanceOperation,
} from "../../shared/presentation/attendance-operation";
import { PageHeading } from "../../shared/ui/page-layout";
import { attendanceDuration, attendanceTime } from "./format";
import { locateAttendance } from "./location";
import { attendanceOperationLabels } from "./operation-labels";

type ResponseData = {
  attendance: AttendanceView;
  version: number;
  sites: Workplace[];
  replayed?: boolean;
};
type Pending = {
  operation: AttendanceOperation;
  body: {
    requestId: string;
    expectedVersion: number;
    location: { latitude: number; longitude: number; accuracy: number };
  };
};
function valid(value: unknown): value is ResponseData {
  if (!value || typeof value !== "object") return false;
  const d = value as ResponseData;
  return (
    Number.isSafeInteger(d.version) &&
    d.version >= 0 &&
    !!d.attendance &&
    Number.isFinite(d.attendance.computedAt) &&
    ["ready", "working"].includes(d.attendance.menuState) &&
    Array.isArray(d.attendance.records) &&
    d.attendance.records.every(
      (r) =>
        typeof r.id === "string" &&
        Number.isFinite(r.startedAt) &&
        (r.endedAt === null || Number.isFinite(r.endedAt)) &&
        !!r.summary &&
        Number.isFinite(r.summary.elapsedMs) &&
        Array.isArray(r.summary.days),
    ) &&
    (d.attendance.active === null ||
      d.attendance.records.some((r) => r.id === d.attendance.active?.id && r.endedAt === null)) &&
    Array.isArray(d.sites) &&
    d.sites.every((s) => Number.isFinite(s.radius) && s.radius > 0) &&
    (d.replayed === undefined || typeof d.replayed === "boolean")
  );
}
const message = (e: unknown) => (e instanceof Error ? e.message : "出勤結果尚未確認，請稍後再試。");

export default function AttendancePanel({ liffId }: { liffId: string }) {
  const [data, setData] = useState<ResponseData | null>(null);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [intent, setIntent] = useState<AttendanceOperation | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  function clearPrivate() {
    setData(null);
    setToken("");
    setPending(null);
    setNotice("");
  }
  async function read(access: string) {
    const response = await fetch("/api/attendance", {
      headers: await authHeaders(access),
      cache: "no-store",
    });
    const value = await response.json();
    if (!response.ok) {
      const error = new Error(value.error || "無法取得出勤紀錄。");
      if (response.status === 401 || response.status === 403) error.name = "AttendanceAccessError";
      throw error;
    }
    if (!valid(value)) throw new Error("出勤回應不完整，請重新整理。");
    return value;
  }
  async function initialize() {
    if (locked.current) return;
    const ticket = ++generation.current;
    clearPrivate();
    setLoading(true);
    setError("");
    try {
      const access = await liffClient.session(liffId);
      if (!access || ticket !== generation.current) return;
      const value = await read(access);
      if (ticket !== generation.current) return;
      setToken(access);
      setData(value);
      const operation = new URL(window.location.href).searchParams.get("operation");
      if (isAttendanceOperation(operation)) setIntent(operation);
    } catch (e) {
      if (ticket === generation.current) setError(message(e));
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }
  async function refresh() {
    if (!token || locked.current) return;
    const ticket = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const access = await liffClient.session(liffId);
      if (ticket !== generation.current) return;
      if (!access) {
        clearPrivate();
        return;
      }
      if (access !== token) {
        clearPrivate();
        setToken(access);
      }
      const value = await read(access);
      if (ticket === generation.current) setData(value);
    } catch (e) {
      if (ticket === generation.current) {
        setData(null);
        if (e instanceof Error && e.name === "AttendanceAccessError") clearPrivate();
        setError(message(e));
      }
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    const visible = () => {
      if (document.visibilityState === "visible" && !pending) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  });
  async function send(request: Pending, ticket: number) {
    setPending(request);
    setNotice("正在記錄…");
    const response = await fetch(`/api/attendance/${request.operation}`, {
      method: "POST",
      headers: { ...(await authHeaders(token)), "Content-Type": "application/json" },
      body: JSON.stringify(request.body),
    });
    const value = await response.json().catch(() => ({}));
    if (ticket !== generation.current) return;
    if (!response.ok) {
      if (response.status < 500) setPending(null);
      if (response.status === 401 || response.status === 403) clearPrivate();
      if (response.status === 409) setData(null);
      throw new Error(value.error || "結果尚未確認，請重送同一筆。");
    }
    if (!valid(value)) throw new Error("回應不完整，請重送同一筆確認。");
    if (typeof value.replayed !== "boolean") throw new Error("回應不完整，請重送同一筆確認。");
    const latest = value.replayed ? await read(token) : value;
    if (ticket !== generation.current) return;
    setData(latest);
    setPending(null);
    setIntent(null);
    setNotice(`${attendanceOperationLabels[request.operation]}已記錄。`);
  }
  async function operate(operation: AttendanceOperation, retry?: Pending) {
    if (locked.current || !token || (!retry && (!data?.sites.length || pending || loading))) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice(retry ? "正在確認原操作…" : "正在取得本次定位…");
    const ticket = ++generation.current;
    try {
      const request = retry ?? {
        operation,
        body: {
          requestId: crypto.randomUUID(),
          expectedVersion: data!.version,
          location: await locateAttendance(),
        },
      };
      if (ticket === generation.current) await send(request, ticket);
    } catch (e) {
      if (ticket === generation.current) {
        setNotice("");
        if (e instanceof Error && e.name === "AttendanceAccessError") clearPrivate();
        setError(message(e));
      }
    } finally {
      locked.current = false;
      if (ticket === generation.current) setBusy(false);
    }
  }
  const active = data?.attendance.active;
  const operation: AttendanceOperation = active ? "clock-out" : "clock-in";
  const stale = !!intent && intent !== operation;
  return (
    <>
      <MiniAppRuntime liffId={liffId} onReady={initialize} onWait={() => setLoading(false)} />
      <PageHeading
        title="出勤"
        description="先確認目前狀態，再執行上班或下班；按下操作後才會取得定位。"
      />
      {loading && <p role="status">正在確認出勤紀錄…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!token && !loading && <button onClick={() => void initialize()}>重新確認 LINE 登入</button>}
      {pending && (
        <section aria-label="待確認操作">
          <p>「{attendanceOperationLabels[pending.operation]}」結果尚未確認，請重送同一筆。</p>
          <button disabled={busy} onClick={() => void operate(pending.operation, pending)}>
            重送同一筆
          </button>
        </section>
      )}
      {data && (
        <>
          <section className="attendance-current" aria-labelledby="attendance-status">
            <h2 id="attendance-status">{active ? "上班中" : "尚未上班"}</h2>
            {active && <p>上班時間：{attendanceTime(active.startedAt)}</p>}
            {stale && (
              <p role="status">
                你開啟的是「{attendanceOperationLabels[intent!]}
                」，目前狀態已不同。請確認下方狀態，再選擇操作。
              </p>
            )}
            {data.sites.length ? (
              <p>
                按下按鈕才取得定位。可打卡地點：
                {data.sites.map((s) => `${s.name}（${s.radius} 公尺）`).join("、")}。
              </p>
            ) : (
              <p>打卡地點尚未設定，請聯絡管理者。</p>
            )}
            <button
              className="attendance-primary"
              disabled={busy || loading || !!pending || !data.sites.length || stale}
              onClick={() => void operate(operation)}
            >
              {attendanceOperationLabels[operation]}
            </button>
            {stale && (
              <button
                className="secondary"
                disabled={busy || !!pending}
                onClick={() => setIntent(null)}
              >
                確認目前狀態
              </button>
            )}
          </section>
          <section aria-labelledby="attendance-records">
            <h2 id="attendance-records">最近出勤紀錄</h2>
            <p>最近 30 天與未結束紀錄 · 計算至 {attendanceTime(data.attendance.computedAt)}</p>
            <p>記錄經過時間未扣除休息；時段分類不等於法定加班或薪資工時。</p>
            {data.attendance.records.length === 0 ? (
              <p>尚無出勤紀錄。</p>
            ) : (
              [...data.attendance.records].reverse().map((r) => (
                <article className="attendance-record" key={r.id}>
                  <h3>
                    {r.day}
                    {r.summary.crossesMidnight ? " · 跨日" : ""}
                    {r.endedAt === null ? " · 進行中" : ""}
                  </h3>
                  <p>
                    上班 {attendanceTime(r.startedAt)}
                    <br />
                    下班 {r.endedAt === null ? "尚未結束" : attendanceTime(r.endedAt)}
                  </p>
                  <p>
                    {r.summary.provisional ? "暫計" : "記錄經過"}{" "}
                    {attendanceDuration(r.summary.elapsedMs)}
                  </p>
                  <dl>
                    <dt>08:00 前</dt>
                    <dd>{attendanceDuration(r.summary.beforeMs)}</dd>
                    <dt>08:00–17:00</dt>
                    <dd>{attendanceDuration(r.summary.scheduledMs)}</dd>
                    <dt>17:00 後</dt>
                    <dd>{attendanceDuration(r.summary.afterMs)}</dd>
                  </dl>
                  {r.summary.crossesMidnight && (
                    <details>
                      <summary>每日明細</summary>
                      {r.summary.days.map((day) => (
                        <p key={day.day}>
                          {day.day} · {attendanceDuration(day.elapsedMs)}（08:00 前{" "}
                          {attendanceDuration(day.beforeMs)}／08:00–17:00{" "}
                          {attendanceDuration(day.scheduledMs)}／17:00 後{" "}
                          {attendanceDuration(day.afterMs)}）
                        </p>
                      ))}
                    </details>
                  )}
                </article>
              ))
            )}
          </section>
        </>
      )}
      <div className="utility-actions">
        <button
          className="secondary"
          disabled={loading || busy || !token}
          onClick={() => void refresh()}
        >
          重新整理狀態
        </button>
        <Link className="secondary-link" href="/home">
          返回工作台
        </Link>
      </div>
    </>
  );
}
