import { entryDestination, hasEntryContinuation } from "./entry-destination";
import { entryReturnUrl, type EntryRoute } from "./entry-route";

type Destination = Exclude<EntryRoute, "pending" | "invalid">;
export type EntryNavigation =
  | { state: "ready" }
  | { state: "pending" }
  | { state: "invalid" }
  | { state: "redirect"; target: string };

export function entryNavigation(
  href: string,
  fallback: Destination = "home",
  renderedPathname?: string,
): EntryNavigation {
  const current = new URL(href);
  // External SDKs can replace browser history without rendering the corresponding App Router tree.
  // Once LIFF has consumed liff.state, re-enter Next navigation using only the sanitized local URL.
  if (
    renderedPathname &&
    renderedPathname !== current.pathname &&
    !current.searchParams.has("liff.state")
  ) {
    const target = entryReturnUrl(href);
    return { state: "redirect", target: target.pathname + target.search };
  }
  // The expenses resource page returns to the workbench when no expense intent is supplied.
  if (fallback === "home" && current.pathname !== "/expenses" && !hasEntryContinuation(href))
    return { state: "ready" };
  const target = entryDestination(href, fallback);
  if (target === "pending" || target === "invalid") return { state: target };
  const destination = new URL(target, current.origin);
  return current.pathname + current.search === destination.pathname + destination.search
    ? { state: "ready" }
    : { state: "redirect", target };
}
