"use client";

import Link from "next/link";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { clearCurrentAccount, ensureCurrentAccount } from "./current-account";
import { resolveProfileDestination } from "./profile-destination";
import { clearVerifiedProfileEntry, rememberVerifiedProfileEntry } from "./profile-entry-handoff";

export default function MemberAvatar({ liffId }: { liffId: string }) {
  const [picture, setPicture] = useState<string>();
  const [href, setHref] = useState<string>();
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);

  const clear = useCallback(() => {
    generation.current++;
    request.current?.abort();
    clearCurrentAccount();
    clearVerifiedProfileEntry();
    setPicture(undefined);
    setHref(undefined);
    setState("loading");
  }, []);

  const load = useCallback(async () => {
    const ticket = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setPicture(undefined);
    setHref(undefined);
    setState("loading");
    try {
      const current = await ensureCurrentAccount(liffId, controller.signal);
      if (ticket !== generation.current || controller.signal.aborted) return;
      if (!current) {
        setState("unavailable");
        return;
      }

      const destination = resolveProfileDestination(current.member);
      if (destination.kind === "redirect") {
        setHref(destination.href);
        setState("ready");
        if (
          current.member?.status === "active" &&
          typeof current.member.id === "string" &&
          typeof current.member.login === "string"
        ) {
          rememberVerifiedProfileEntry({
            userId: current.member.id,
            login: current.member.login,
            token: current.token,
          });
        }
      } else {
        setState("unavailable");
      }

      // Provider profile is optional presentation data and never gates the verified destination.
      void liffClient.profile().then(
        (profile) => {
          if (ticket !== generation.current) return;
          setPicture(profile.pictureUrl?.startsWith("https://") ? profile.pictureUrl : undefined);
        },
        () => {
          if (ticket === generation.current) setPicture(undefined);
        },
      );
    } catch {
      if (ticket === generation.current && !controller.signal.aborted) {
        setHref("/profile");
        setState("error");
      }
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
      clearCurrentAccount();
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
      {state === "ready" || state === "error" ? (
        <Link
          href={href ?? "/profile"}
          className="member-avatar"
          aria-label="個人檔案"
          title={state === "error" ? "重新確認個人檔案" : "個人檔案"}
        >
          {avatar}
        </Link>
      ) : (
        <span className="member-avatar" aria-label="個人檔案目前不可用" title="個人檔案目前不可用">
          {avatar}
        </span>
      )}
    </>
  );
}
