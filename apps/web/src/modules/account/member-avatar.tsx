"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";

type AccountProjection = {
  member?: {
    login?: string | null;
  } | null;
};

export default function MemberAvatar({ liffId }: { liffId: string }) {
  const [picture, setPicture] = useState<string>();
  const [login, setLogin] = useState<string>();
  const generation = useRef(0);

  const clear = useCallback(() => {
    generation.current++;
    setPicture(undefined);
    setLogin(undefined);
  }, []);

  const load = useCallback(async () => {
    const ticket = ++generation.current;
    const token = await liffClient.session(liffId);
    if (!token || ticket !== generation.current) return;

    const [profileResult, membershipResult] = await Promise.allSettled([
      liffClient.profile(),
      fetch("/api/membership", {
        headers: { "x-line-token": token },
        cache: "no-store",
      }),
    ]);
    if (ticket !== generation.current) return;

    if (
      profileResult.status === "fulfilled" &&
      profileResult.value.pictureUrl?.startsWith("https://")
    ) {
      setPicture(profileResult.value.pictureUrl);
    } else {
      setPicture(undefined);
    }

    if (membershipResult.status !== "fulfilled" || !membershipResult.value.ok) {
      setLogin(undefined);
      return;
    }
    const value = (await membershipResult.value.json()) as AccountProjection;
    if (ticket !== generation.current) return;
    const accountLogin = value.member?.login;
    setLogin(typeof accountLogin === "string" && accountLogin ? accountLogin : undefined);
  }, [liffId]);

  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  const avatar = picture ? (
    // LINE hosts the profile photo; avoid proxying private profile images through Next.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={picture}
      alt=""
      width={44}
      height={44}
      referrerPolicy="no-referrer"
      onError={() => setPicture(undefined)}
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
      {login ? (
        <Link
          href={`/${encodeURIComponent(login)}`}
          className="member-avatar"
          aria-label="個人檔案"
          title="個人檔案"
        >
          {avatar}
        </Link>
      ) : (
        <span className="member-avatar" aria-label="個人檔案載入中" aria-disabled="true">
          {avatar}
        </span>
      )}
    </>
  );
}
