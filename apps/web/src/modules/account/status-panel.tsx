"use client";

import type { UserProfileStatusChange } from "@line_bot_v1/account/contracts/dto/user-profile-status";
import {
  readChangedStatus,
  readStatus,
} from "@line_bot_v1/account/contracts/parse-status-response";
import type { UserProfileStatus } from "@line_bot_v1/account/contracts/repositories/user-profile-status";
import { isRecord } from "@line_bot_v1/platform/validation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import styles from "./status-panel.module.css";
import { responseError } from "./wire-response";

type Draft = {
  message: string;
  emoji: string;
  limitedAvailability: boolean;
  expiresAt: string;
  expectedVersion: number;
};

const emptyDraft: Draft = {
  message: "",
  emoji: "",
  limitedAvailability: false,
  expiresAt: "",
  expectedVersion: 0,
};

function localDateTime(value: number | null) {
  if (value === null) return "";
  const date = new Date(value);
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function draftFrom(status: UserProfileStatus | null): Draft {
  return status
    ? {
        message: status.message ?? "",
        emoji: status.emoji ?? "",
        limitedAvailability: status.limitedAvailability,
        expiresAt: localDateTime(status.expiresAt),
        expectedVersion: status.version,
      }
    : emptyDraft;
}

function draftFromChange(change: UserProfileStatusChange): Draft {
  return {
    message: change.message ?? "",
    emoji: change.emoji ?? "",
    limitedAvailability: change.limitedAvailability,
    expiresAt: localDateTime(change.expiresAt),
    expectedVersion: change.expectedVersion,
  };
}

function commandFrom(draft: Draft, requestId: string): UserProfileStatusChange {
  const datetime = draft.expiresAt.replace(
    /^(\d{5,})-/,
    (_match: string, year: string) => `+${year.padStart(6, "0")}-`,
  );
  const expiresAt = datetime ? Date.parse(datetime) : null;
  if (expiresAt !== null && !Number.isSafeInteger(expiresAt)) {
    throw new Error("請選擇有效的到期時間。");
  }
  return {
    requestId,
    message: draft.message.trim() || null,
    emoji: draft.emoji.trim() || null,
    limitedAvailability: draft.limitedAvailability,
    expiresAt,
    expectedVersion: draft.expectedVersion,
  };
}

function commandPayload(command: UserProfileStatusChange) {
  return JSON.stringify({
    message: command.message,
    emoji: command.emoji,
    limitedAvailability: command.limitedAvailability,
    expiresAt: command.expiresAt,
    expectedVersion: command.expectedVersion,
  });
}

export default function StatusPanel({ token }: { token: string }) {
  const [status, setStatus] = useState<UserProfileStatus | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [displayNow, setDisplayNow] = useState(() => Date.now());
  const generation = useRef(0);
  const pending = useRef<UserProfileStatusChange | null>(null);
  const pendingToken = useRef(token);

  function clearLocal() {
    generation.current++;
    setStatus(null);
    setDraft(emptyDraft);
    setEditing(false);
    setLoaded(false);
    setBusy(false);
    setError("");
    setNotice("");
  }

  async function readCurrentStatus() {
    const response = await fetch("/api/profile/status", {
      headers: { "X-App-Session-Generation": token },
      cache: "no-store",
    });
    const value: unknown = await response.json();
    if (!response.ok) throw new Error(responseError(value, "狀態讀取失敗。"));
    if (!isRecord(value)) throw new Error("狀態回應格式不正確。");
    return value.status === null ? null : readStatus(value.status);
  }

  async function load() {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const current = await readCurrentStatus();
      if (ticket !== generation.current) return;
      setStatus(current);
      setDraft(pending.current ? draftFromChange(pending.current) : draftFrom(current));
      setLoaded(true);
    } catch (cause) {
      if (ticket === generation.current) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  async function save(clear = false) {
    if (busy) return;
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const nextDraft = clear ? { ...emptyDraft, expectedVersion: draft.expectedVersion } : draft;
      const fresh = commandFrom(nextDraft, crypto.randomUUID());
      const command =
        pending.current && commandPayload(pending.current) === commandPayload(fresh)
          ? pending.current
          : fresh;
      if (pending.current && pending.current !== command) {
        throw new Error("上一筆狀態更新結果尚待確認；請保留原內容重試或先重新載入。");
      }
      pending.current = command;
      const response = await fetch("/api/profile/status", {
        method: "POST",
        headers: {
          "X-App-Session-Generation": token,
          "content-type": "application/json",
        },
        body: JSON.stringify(command),
      });
      if (ticket !== generation.current) return;
      const value: unknown = await response.json();
      if (ticket !== generation.current) return;
      if (!response.ok) {
        const cause = new Error(responseError(value, "狀態更新失敗。"));
        if (response.status === 409) {
          const current = await readCurrentStatus();
          if (ticket !== generation.current) return;
          pending.current = null;
          setStatus(current);
          setDraft(draftFrom(current));
          setLoaded(true);
          setError(cause.message);
          return;
        }
        if (response.status < 500) pending.current = null;
        throw cause;
      }
      if (!isRecord(value)) throw new Error("狀態更新回應格式不正確。");
      const changed = readChangedStatus(value.status);
      if (changed.requestId !== command.requestId) {
        throw new Error("狀態更新結果無法確認；重試會沿用相同操作編號。");
      }
      const current = await readCurrentStatus();
      if (ticket !== generation.current) return;
      pending.current = null;
      setStatus(current);
      setDraft(draftFrom(current));
      setLoaded(true);
      setEditing(false);
      setNotice(clear ? "狀態已清除。" : "狀態已更新。");
    } catch (cause) {
      if (ticket === generation.current) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  const onVisibilityChange = useEffectEvent(() => {
    if (document.visibilityState === "hidden") clearLocal();
    else void load();
  });
  const loadCurrent = useEffectEvent(() => load());
  const clearCurrent = useEffectEvent(() => clearLocal());

  useEffect(() => {
    if (pendingToken.current !== token) {
      pending.current = null;
      pendingToken.current = token;
      clearCurrent();
    }
    void loadCurrent();
    const visibility = () => onVisibilityChange();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      generation.current++;
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [token]);

  useEffect(() => {
    setDisplayNow(Date.now());
    if (status?.expiresAt === null || status?.expiresAt === undefined) return;
    let timeout = 0;
    const updateAtExpiration = () => {
      const delay = status.expiresAt ? status.expiresAt - Date.now() : 0;
      if (delay <= 0) {
        setDisplayNow(Date.now());
        return;
      }
      timeout = window.setTimeout(updateAtExpiration, Math.min(delay + 50, 2_147_483_647));
    };
    updateAtExpiration();
    return () => window.clearTimeout(timeout);
  }, [status?.expiresAt]);

  if (!loaded) {
    return (
      <div className={styles.panel}>
        {busy && <p role="status">正在確認狀態…</p>}
        {error && <p role="alert">{error}</p>}
        {!busy && (
          <button type="button" className="secondary" onClick={() => void load()}>
            重新載入狀態
          </button>
        )}
      </div>
    );
  }

  const visible = Boolean(
    status &&
      (status.message || status.emoji || status.limitedAvailability) &&
      (status.expiresAt === null || status.expiresAt > displayNow),
  );
  const summary = visible
    ? [status?.emoji, status?.message || (status?.limitedAvailability ? "忙碌中" : "")]
        .filter(Boolean)
        .join(" ")
    : "Set your status";

  return (
    <div className={styles.panel}>
      <button
        type="button"
        className={styles.summary}
        aria-label="Set your status"
        aria-expanded={editing}
        onClick={() => {
          setDraft(pending.current ? draftFromChange(pending.current) : draftFrom(status));
          setEditing((value) => !value);
        }}
      >
        <span aria-hidden="true">{visible ? "💬" : "☺"}</span>
        <span>{summary}</span>
        <span className={styles.edit} aria-hidden="true">
          ✎
        </span>
      </button>
      {editing && (
        <form
          className={styles.editor}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <p>此狀態會公開顯示於你的 Profile。</p>
          <label>
            表情
            <input
              maxLength={64}
              value={draft.emoji}
              onChange={(event) => setDraft({ ...draft, emoji: event.target.value })}
              placeholder="例如 🎯"
            />
          </label>
          <label>
            狀態訊息
            <input
              maxLength={80}
              value={draft.message}
              onChange={(event) => setDraft({ ...draft, message: event.target.value })}
              placeholder="你正在做什麼？"
            />
          </label>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={draft.limitedAvailability}
              onChange={(event) =>
                setDraft({ ...draft, limitedAvailability: event.target.checked })
              }
            />
            顯示忙碌中
          </label>
          <label>
            到期時間（選填）
            <input
              type="datetime-local"
              value={draft.expiresAt}
              onChange={(event) => setDraft({ ...draft, expiresAt: event.target.value })}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}
          <div className={styles.actions}>
            <button type="submit" disabled={busy}>
              {busy ? "正在更新…" : "更新狀態"}
            </button>
            <button type="button" disabled={busy} onClick={() => void save(true)}>
              清除狀態
            </button>
            <button type="button" disabled={busy} onClick={() => void load()}>
              重新載入
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDraft(pending.current ? draftFromChange(pending.current) : draftFrom(status));
                setEditing(false);
              }}
            >
              取消
            </button>
          </div>
        </form>
      )}
      {!editing && error && <p role="alert">{error}</p>}
      {!editing && notice && <p role="status">{notice}</p>}
    </div>
  );
}
