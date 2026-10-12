export type HistoryAction = "pushState" | "replaceState";

export function viewFromSearchParams<T extends string>(
  searchParams: Pick<URLSearchParams, "getAll">,
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const values = searchParams.getAll(name);
  return values.length === 1
    ? (allowed.find((value) => value === values[0]) ?? fallback)
    : fallback;
}

export function viewRouteChange<T extends string>({
  href,
  name,
  next,
  current,
  fallback,
  clear = [],
  omitFallback = false,
}: {
  href: string;
  name: string;
  next: T;
  current: T;
  fallback: T;
  clear?: readonly string[];
  omitFallback?: boolean;
}): { href: string; action: HistoryAction } | null {
  const url = new URL(href);
  for (const key of clear) url.searchParams.delete(key);
  if (omitFallback && next === fallback) url.searchParams.delete(name);
  else url.searchParams.set(name, next);
  return url.href === href
    ? null
    : {
        href: url.pathname + url.search + url.hash,
        action: next === current ? "replaceState" : "pushState",
      };
}
