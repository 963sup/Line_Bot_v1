import { entryDestination, hasEntryContinuation } from "./entry-destination";
import type { EntryRoute } from "./entry-route";

type Destination = Exclude<EntryRoute, "pending" | "invalid">;
export type EntryNavigation =
  | { state: "ready" }
  | { state: "pending" }
  | { state: "invalid" }
  | { state: "redirect"; target: string };

export function entryNavigation(href: string, fallback: Destination = "home"): EntryNavigation {
  const current = new URL(href);
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
