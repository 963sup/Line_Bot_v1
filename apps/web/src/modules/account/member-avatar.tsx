"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";

export default function MemberAvatar() {
  const pathname = usePathname();
  const [picture, setPicture] = useState<string>();
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const profile = await liffClient.profile();
        if (active && profile.pictureUrl?.startsWith("https://")) setPicture(profile.pictureUrl);
      } catch {
        // Missing profile permission or photo keeps the accessible fallback.
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);
  return (
    <Link
      href="/settings"
      className="shell-avatar"
      aria-label="設定"
      title="設定"
      aria-current={
        pathname === "/settings" || pathname.startsWith("/settings/") ? "page" : undefined
      }
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
