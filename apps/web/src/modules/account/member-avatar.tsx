"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";

type AccountProjection = {
  member?: {
    login?: string | null;
  } | null;
};

export default function MemberAvatar({ liffId }: { liffId: string }) {
  const [picture, setPicture] = useState<string>();
  const [login, setLogin] = useState<string>();

  useEffect(() => {
    let active = true;

    async function load() {
      const [profileResult, tokenResult] = await Promise.allSettled([
        liffClient.profile(),
        liffClient.session(liffId),
      ]);

      if (!active) return;

      if (
        profileResult.status === "fulfilled" &&
        profileResult.value.pictureUrl?.startsWith("https://")
      ) {
        setPicture(profileResult.value.pictureUrl);
      }

      const token = tokenResult.status === "fulfilled" ? tokenResult.value : null;
      if (!token) return;

      try {
        const response = await fetch("/api/membership", {
          headers: { "x-line-token": token },
          cache: "no-store",
        });
        if (!response.ok) return;
        const value = (await response.json()) as AccountProjection;
        const accountLogin = value.member?.login;
        if (active && typeof accountLogin === "string" && accountLogin) {
          setLogin(accountLogin);
        }
      } catch {
        // Keep the safe settings fallback while the current Account locator is unavailable.
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [liffId]);

  return (
    <Link
      href={login ? `/${encodeURIComponent(login)}` : "/settings"}
      className="member-avatar"
      aria-label={login ? "個人檔案" : "設定"}
      title={login ? "個人檔案" : "設定"}
    >
      {picture ? (
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
      )}
    </Link>
  );
}
