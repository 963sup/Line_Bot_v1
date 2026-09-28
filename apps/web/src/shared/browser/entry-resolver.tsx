"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useRef, useState } from "react";
import { entryNavigation } from "../presentation/entry-navigation";
import type { EntryRoute } from "../presentation/entry-route";
import MiniAppRuntime from "./mini-app-runtime";

/** Entry continuation only; destination layouts and APIs own membership checks. */
export default function EntryResolver({
  liffId,
  fallback = "home",
  children,
}: {
  liffId: string;
  fallback?: Exclude<EntryRoute, "pending" | "invalid">;
  children?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const renderedPathname = useRef(pathname);
  const [state, setState] = useState<"waiting" | "ready" | "pending" | "invalid">("waiting");
  if (state === "ready") return children;
  return (
    <>
      <MiniAppRuntime
        key={`${pathname}?${search.toString()}`}
        liffId={liffId}
        onWait={() => setState("waiting")}
        onReady={async () => {
          const next = entryNavigation(location.href, fallback, renderedPathname.current);
          if (next.state === "redirect") {
            router.replace(next.target);
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
