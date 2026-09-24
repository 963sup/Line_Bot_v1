"use client";
import { parseLocation } from "@line-work/attendance/domain";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { authHeaders } from "../../shared/browser/supabase-session";
import {
  type AttendanceOperation,
  isAttendanceOperation,
} from "../../shared/presentation/attendance-operation";
import { attendanceTime } from "./format";
import { locateAttendance } from "./location";
import { attendanceOperationLabels } from "./operation-labels";

type Body = {
  requestId: string;
  expectedVersion: number;
  location: { latitude: number; longitude: number; accuracy: number };
};
type Attempt = { owner: string; operation: AttendanceOperation } & (
  | { phase: "started" }
  | { phase: "pending"; body: Body }
  | { phase: "done"; at: number }
);
const key = "attendance-auto-attempt-v1";
function readAttempt(): Attempt | null {
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (
    !value ||
    typeof value.owner !== "string" ||
    !value.owner ||
    !isAttendanceOperation(value.operation)
  )
    throw new Error("打卡暫存無法辨識，請先查看出勤紀錄。");
  if (value.phase === "pending") {
    const body = value.body;
    if (
      !body ||
      !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.requestId) ||
      !Number.isSafeInteger(body.expectedVersion) ||
      body.expectedVersion < 0
    )
      throw new Error("原打卡命令不完整，請先查看出勤紀錄。");
    parseLocation(body.location);
  } else if (value.phase !== "started" && !(value.phase === "done" && Number.isFinite(value.at))) {
    throw new Error("打卡暫存無法辨識，請先查看出勤紀錄。");
  }
  return value as Attempt;
}
function saveAttempt(attempt: Attempt) {
  const raw = JSON.stringify(attempt);
  sessionStorage.setItem(key, raw);
  if (sessionStorage.getItem(key) !== raw)
    throw new Error("無法保存本次操作，請恢復瀏覽器儲存後再試。");
}

export default function AutoClock({
  liffId,
  operation,
}: {
  liffId: string;
  operation: AttendanceOperation;
}) {
  const running = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState("正在確認 LINE 登入…");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === "hidden") {
        running.current?.abort();
        setAttempt(null);
        setStatus("操作已暫停，請重新確認。");
        setBusy(false);
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      running.current?.abort();
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  function close() {
    if (liffClient.inClient()) {
      try {
        liffClient.close();
      } catch {
        /* The receipt remains visible if closing fails. */
      }
    }
  }
  async function run(explicit = false) {
    if (running.current && !running.current.signal.aborted) return;
    const controller = new AbortController();
    running.current = controller;
    const { signal } = controller;
    setBusy(true);
    setError("");
    setAttempt(null);
    setStatus("正在確認出勤狀態…");
    let submitted = false;
    let current: Attempt | null = null;
    try {
      const token = await liffClient.session(liffId);
      signal.throwIfAborted();
      if (!token) return;
      const headers = await authHeaders(token);
      const response = await fetch("/api/attendance?view=clock", {
        headers,
        cache: "no-store",
        signal,
      });
      const data = await response.json();
      signal.throwIfAborted();
      if (!response.ok) throw new Error(data.error || "無法確認會員資格。");
      if (
        typeof data.memberId !== "string" ||
        !data.memberId ||
        !Number.isSafeInteger(data.version) ||
        data.version < 0 ||
        typeof data.working !== "boolean"
      )
        throw new Error("出勤回應不完整，請重試。");
      current = readAttempt();
      if (current && current.owner !== data.memberId) {
        // Never replay another account's command or display its receipt.
        saveAttempt({ owner: data.memberId, operation, phase: "started" });
        throw new Error("會員身分已變更，請重新確認本次打卡。");
      }
      if (current && !explicit) {
        setAttempt(current);
        setStatus(
          current.phase === "done"
            ? `${attendanceOperationLabels[current.operation]}已記錄：${attendanceTime(current.at)}`
            : "此入口已有操作，請確認後繼續。",
        );
        return;
      }
      if (current?.phase !== "pending") {
        if ((operation === "clock-in") === data.working)
          throw new Error(
            operation === "clock-in"
              ? "目前已上班，不會重複上班打卡。"
              : "目前尚未上班，無法下班打卡。",
          );
        if (!Array.isArray(data.sites) || !data.sites.length)
          throw new Error("打卡地點尚未設定，請聯絡管理者。");
        if (!liffClient.inClient() && !explicit) {
          saveAttempt({ owner: data.memberId, operation, phase: "started" });
          setStatus("請確認後定位打卡。");
          return;
        }
        current = { owner: data.memberId, operation, phase: "started" };
        saveAttempt(current);
        setStatus("正在取得本次定位…");
        const location = await locateAttendance();
        signal.throwIfAborted();
        current = {
          owner: data.memberId,
          operation,
          phase: "pending",
          body: { requestId: crypto.randomUUID(), expectedVersion: data.version, location },
        };
        saveAttempt(current);
      }
      setAttempt(current);
      setStatus(`正在確認${attendanceOperationLabels[current.operation]}…`);
      if ((await liffClient.session(liffId)) !== token)
        throw new Error("LINE 登入已變更，請重新確認本次打卡。");
      signal.throwIfAborted();
      submitted = true;
      const result = await fetch(`/api/attendance/${current.operation}?view=clock`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(current.body),
        signal,
      });
      const receipt = await result.json();
      signal.throwIfAborted();
      if (!result.ok) {
        if (result.status < 500 && result.status !== 408) {
          current = { owner: data.memberId, operation: current.operation, phase: "started" };
          saveAttempt(current);
          setAttempt(current);
        }
        throw new Error(receipt.error || "結果尚未確認，請重試同一筆。");
      }
      const at = receipt.at;
      if (receipt.version !== current.body.expectedVersion + 1 || !Number.isFinite(at))
        throw new Error("打卡回執不完整，請重試同一筆。");
      current = { owner: data.memberId, operation: current.operation, phase: "done", at };
      saveAttempt(current);
      setAttempt(current);
      setStatus(`${attendanceOperationLabels[current.operation]}已記錄：${attendanceTime(at)}`);
      close();
    } catch (cause) {
      if (!signal.aborted) {
        setError(cause instanceof Error ? cause.message : "打卡未完成，請重試。");
        setStatus(
          submitted
            ? current?.phase === "started"
              ? "本次打卡遭拒絕，請重新確認後再試。"
              : "請確認原操作結果，勿另開一筆。"
            : "本次尚未送出打卡。",
        );
      }
    } finally {
      if (running.current === controller) running.current = null;
      if (!signal.aborted) setBusy(false);
    }
  }
  return (
    <main className="app-content">
      <MiniAppRuntime
        liffId={liffId}
        onReady={async () => {
          setReady(true);
          await run();
        }}
        onWait={() => setBusy(false)}
      />
      <h1>{attendanceOperationLabels[operation]}打卡</h1>
      <p>將取得本次定位並驗證工作地點。</p>
      <p role="status">{status}</p>
      {error && <p role="alert">{error}</p>}
      {!busy && ready && (
        <button onClick={() => void run(true)}>
          {attempt?.phase === "pending"
            ? `重試同一筆${attendanceOperationLabels[attempt.operation]}`
            : attempt?.phase === "done"
              ? `開始新的${attendanceOperationLabels[operation]}打卡`
              : "重新確認並定位打卡"}
        </button>
      )}
      {attempt?.phase === "done" && <button onClick={close}>返回聊天室</button>}
      <p>
        <Link href="/attendance">查看出勤紀錄</Link>
      </p>
    </main>
  );
}
