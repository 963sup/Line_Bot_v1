"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { entryNavigation } from "../presentation/entry-navigation";
import type { EntryRoute } from "../presentation/entry-route";
import MiniAppRuntime from "./mini-app-runtime";

/** Entry continuation only; destination layouts and APIs own membership checks. */
export default function EntryResolver({
  liffId,
  fallback = "home",
  children,
  resolveRedirect,
  initialRenderedPathname,
}: {
  liffId: string;
  fallback?: Exclude<EntryRoute, "pending" | "invalid">;
  children?: ReactNode;
  resolveRedirect?: (target: string, signal: AbortSignal) => Promise<string | null>;
  initialRenderedPathname?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const renderedPathname = useRef(initialRenderedPathname ?? pathname);
  const resolving = useRef<AbortController | null>(null);
  const [state, setState] = useState<"waiting" | "ready" | "pending" | "invalid">("waiting");
  useEffect(
    () => () => {
      resolving.current?.abort();
    },
    [],
  );
  if (state === "ready") return children;
  return (
    <>
      <MiniAppRuntime
        key={`${pathname}?${search.toString()}`}
        liffId={liffId}
        onWait={() => {
          resolving.current?.abort();
          setState("waiting");
        }}
        onReady={async () => {
          const next = entryNavigation(location.href, fallback, renderedPathname.current);
          if (next.state === "redirect") {
            if (!resolveRedirect) {
              router.replace(next.target);
              return;
            }
            resolving.current?.abort();
            const controller = new AbortController();
            resolving.current = controller;
            const target = await resolveRedirect(next.target, controller.signal);
            if (controller.signal.aborted) return;
            if (!target) {
              setState("pending");
              return;
            }
            router.replace(target);
            return;
          }
          setState(next.state);
        }}
      />
      <p role={state === "invalid" ? "alert" : "status"}>
        {state === "invalid" ? "入口連結不完整，請重新選擇服務。" : "正在接續 LINE 入口…"}
      </p>
    </>
  );
}
