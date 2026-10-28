"use client";

import { useEffect, useRef, useState } from "react";
import { readNetwork, responseError } from "./wire-response";

type FollowState = "loading" | "following" | "not-following" | "error";

async function readFollowing(
  token: string,
  targetUserId: string,
  signal: AbortSignal,
): Promise<boolean> {
  const response = await fetch("/api/follows", {
    headers: { "X-App-Session-Generation": token },
    cache: "no-store",
    signal,
  });
  const value: unknown = await response.json();
  signal.throwIfAborted();
  if (!response.ok) throw new Error(responseError(value, "追蹤狀態讀取失敗。"));
  return readNetwork(value).following.some((item) => item.userId === targetUserId);
}

export default function ProfileFollowControl({
  token,
  targetUserId,
}: {
  token: string;
  targetUserId: string;
}) {
  const [state, setState] = useState<FollowState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const ticket = ++generation.current;
    const controller = new AbortController();
    activeRequest.current?.abort();
    activeRequest.current = controller;
    setState("loading");
    setBusy(false);
    setError("");

    void readFollowing(token, targetUserId, controller.signal).then(
      (following) => {
        if (ticket === generation.current) {
          setState(following ? "following" : "not-following");
        }
      },
      (cause: unknown) => {
        if (ticket === generation.current && !controller.signal.aborted) {
          setState("error");
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      },
    );

    return () => {
      generation.current++;
      controller.abort();
      if (activeRequest.current === controller) activeRequest.current = null;
    };
  }, [targetUserId, token]);

  async function mutate() {
    if (state !== "following" && state !== "not-following") return;
    const ticket = ++generation.current;
    const controller = new AbortController();
    activeRequest.current?.abort();
    activeRequest.current = controller;
    const action = state === "following" ? "unfollow" : "follow";
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/follows", {
        method: "POST",
        headers: {
          "X-App-Session-Generation": token,
          "content-type": "application/json",
        },
        body: JSON.stringify({ action, targetUserId }),
        signal: controller.signal,
      });
      const value: unknown = await response.json();
      controller.signal.throwIfAborted();
      if (!response.ok) throw new Error(responseError(value, "追蹤操作失敗。"));
      const following = await readFollowing(token, targetUserId, controller.signal);
      if (ticket === generation.current) {
        setState(following ? "following" : "not-following");
      }
    } catch (cause) {
      if (ticket === generation.current && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (ticket === generation.current) {
        setBusy(false);
        if (activeRequest.current === controller) activeRequest.current = null;
      }
    }
  }

  if (state === "loading") return <p role="status">正在讀取追蹤狀態…</p>;
  if (state === "error") return <p role="status">{error}</p>;

  const following = state === "following";
  return (
    <div>
      <button type="button" aria-pressed={following} disabled={busy} onClick={() => void mutate()}>
        {busy ? "正在更新…" : following ? "取消追蹤" : "追蹤"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
