"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { liffClient } from "../../../shared/browser/liff-client";
import MiniAppRuntime from "../../../shared/browser/mini-app-runtime";

type AccountProjection = {
  member?: {
    login?: string | null;
  } | null;
};

export function isOwnProfileLogin(accountLogin: unknown, profileLogin: string) {
  return typeof accountLogin === "string" && accountLogin === profileLogin;
}

export default function ProfileSettingsAction({
  liffId,
  profileLogin,
}: {
  liffId: string;
  profileLogin: string;
}) {
  const [visible, setVisible] = useState(false);
  const generation = useRef(0);

  const clear = useCallback(() => {
    generation.current++;
    setVisible(false);
  }, []);

  const load = useCallback(async () => {
    const ticket = ++generation.current;
    try {
      const token = await liffClient.session(liffId);
      if (!token || ticket !== generation.current) {
        setVisible(false);
        return;
      }

      const response = await fetch("/api/membership", {
        headers: { "x-line-token": token },
        cache: "no-store",
      });
      if (ticket !== generation.current || !response.ok) {
        setVisible(false);
        return;
      }

      const value = (await response.json()) as AccountProjection;
      setVisible(isOwnProfileLogin(value.member?.login, profileLogin));
    } catch {
      if (ticket === generation.current) setVisible(false);
    }
  }, [liffId, profileLogin]);

  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  return (
    <>
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} silent />
      {visible && (
        <Link
          className="profile-settings-action"
          href="/settings"
          aria-label="Settings"
          title="Settings"
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.12.38.34.73.64 1 .3.27.69.42 1.1.4H21v4h-.09a1.7 1.7 0 0 0-1.51.6Z" />
          </svg>
        </Link>
      )}
    </>
  );
}
