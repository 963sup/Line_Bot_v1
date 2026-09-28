"use client";

import Link from "next/link";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { type ProfileAccount, resolveProfileDestination } from "./profile-destination";

export default function MemberAvatar({ liffId }: { liffId: string }) {
  const [picture, setPicture] = useState<string>();
  const [href, setHref] = useState("/profile");
  const [unavailable, setUnavailable] = useState(false);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);

  const clear = useCallback(() => {
    generation.current++;
    request.current?.abort();
    setPicture(undefined);
    setHref("/profile");
    setUnavailable(false);
  }, []);

  const load = useCallback(async () => {
    const ticket = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setPicture(undefined);
    setHref("/profile");
    setUnavailable(false);
    const token = await liffClient.session(liffId);
    if (!token || ticket !== generation.current) return;

    void liffClient.profile().then(
      (profile) => {
        if (ticket !== generation.current) return;
        setPicture(profile.pictureUrl?.startsWith("https://") ? profile.pictureUrl : undefined);
      },
      () => {
        if (ticket === generation.current) setPicture(undefined);
      },
    );
    // Resolve navigation while Home is visible, independently of the optional LINE photo.
    // This locator is never reused as authorization for the destination's private data.
    try {
      const response = await fetch("/api/membership?view=account", {
        headers: { "x-line-token": token },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) return;
      const value = (await response.json()) as { member?: ProfileAccount | null };
      if (ticket !== generation.current || controller.signal.aborted || value.member === undefined)
        return;
      const destination = resolveProfileDestination(value.member);
      if (destination.kind === "redirect") setHref(destination.href);
      else setUnavailable(true);
    } catch {
      // Keep the explicit entry resolver available when the background lookup fails.
    }
  }, [liffId]);

  const onVisibilityChange = useEffectEvent(() => {
    if (document.visibilityState === "hidden") clear();
    else void load().catch(clear);
  });

  useEffect(() => {
    const visibility = () => onVisibilityChange();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      generation.current++;
      request.current?.abort();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  const avatar = picture ? (
    // LINE hosts the profile photo; avoid proxying private profile images through Next.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={picture}
      alt=""
      width={44}
      height={44}
      referrerPolicy="no-referrer"
      onError={() => setPicture((current) => (current === picture ? undefined : current))}
    />
  ) : (
    <svg
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 22v-2a8 8 0 0 1 16 0v2" />
    </svg>
  );

  return (
    <>
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} silent />
      {unavailable ? (
        <span className="member-avatar" aria-label="個人檔案目前不可用" title="個人檔案目前不可用">
          {avatar}
        </span>
      ) : (
        <Link href={href} className="member-avatar" aria-label="個人檔案" title="個人檔案">
          {avatar}
        </Link>
      )}
    </>
  );
}
