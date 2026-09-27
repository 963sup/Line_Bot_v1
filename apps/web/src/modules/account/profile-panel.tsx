"use client";

import type {
  UserProfile,
  UserProfileVisibility,
} from "@line-work/account/application/ports/profile";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";

type Draft = {
  displayName: string;
  bio: string;
  visibility: UserProfileVisibility;
  expectedVersion: number;
};

const emptyDraft: Draft = {
  displayName: "",
  bio: "",
  visibility: "private",
  expectedVersion: 0,
};

function draftFrom(profile: UserProfile | null): Draft {
  return profile
    ? {
        displayName: profile.displayName ?? "",
        bio: profile.bio ?? "",
        visibility: profile.visibility,
        expectedVersion: profile.version,
      }
    : emptyDraft;
}

export default function ProfilePanel({ liffId }: { liffId: string }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0);

  function clear() {
    generation.current++;
    setProfile(null);
    setDraft(emptyDraft);
    setLoaded(false);
    setBusy(false);
    setError("");
    setNotice("");
  }

  async function load() {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const token = await liffClient.session(liffId);
      if (!token) throw new Error("請完成 LINE 登入後重試。");
      const response = await fetch("/api/profile", {
        headers: { "x-line-token": token },
        cache: "no-store",
      });
      const value = (await response.json()) as { profile?: UserProfile | null; error?: string };
      if (!response.ok) throw new Error(value.error ?? "個人資料讀取失敗。");
      if (ticket !== generation.current) return;
      const next = value.profile ?? null;
      setProfile(next);
      setDraft(draftFrom(next));
      setLoaded(true);
    } catch (cause) {
      if (ticket === generation.current) {
        setLoaded(false);
        setError(cause instanceof Error ? cause.message : "個人資料讀取失敗。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  async function save() {
    if (busy) return;
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const token = await liffClient.session(liffId);
      if (!token) throw new Error("請完成 LINE 登入後重試。");
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: {
          "x-line-token": token,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          displayName: draft.displayName.trim() || null,
          bio: draft.bio.trim() || null,
          visibility: draft.visibility,
          expectedVersion: draft.expectedVersion,
        }),
      });
      const value = (await response.json()) as { profile?: UserProfile; error?: string };
      if (!response.ok || !value.profile) {
        throw new Error(value.error ?? "個人資料保存失敗。");
      }
      if (ticket !== generation.current) return;
      setProfile(value.profile);
      setDraft(draftFrom(value.profile));
      setLoaded(true);
      setNotice("個人資料已保存。");
    } catch (cause) {
      if (ticket === generation.current) {
        setError(cause instanceof Error ? cause.message : "個人資料保存失敗。");
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
    <div className="profile-panel">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      {busy && <p role="status">正在確認個人資料…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loaded && (
        <form
          className="profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label>
            顯示名稱
            <input
              maxLength={120}
              value={draft.displayName}
              onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
              placeholder="你的產品顯示名稱"
            />
          </label>
          <label>
            自我介紹
            <textarea
              maxLength={2000}
              value={draft.bio}
              onChange={(event) => setDraft({ ...draft, bio: event.target.value })}
              placeholder="簡短說明你的工作或角色"
            />
          </label>
          <label>
            Profile 可見範圍
            <select
              value={draft.visibility}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  visibility: event.target.value as UserProfileVisibility,
                })
              }
            >
              <option value="private">僅自己</option>
              <option value="organization">Organization</option>
              <option value="public">公開</option>
            </select>
          </label>
          <p className="profile-note">
            Profile visibility 不授予任何 Enterprise、Organization、Team 或儲存庫權限。
          </p>
          <div className="inline-actions">
            <button type="submit" disabled={busy}>
              保存個人資料
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={() => void load()}>
              重新載入
            </button>
          </div>
          {profile && <small className="profile-version">版本 {profile.version}</small>}
        </form>
      )}
    </div>
  );
}
