const measuredPaths = new Set([
  "/",
  "/home",
  "/assistant",
  "/explore",
  "/trending",
  "/profile",
  "/settings",
  "/attendance",
  "/repositories",
  "/team",
  "/partners",
  "/notifications",
  "/expenses",
]);

/** Only send aggregate page URLs, never callback parameters or record identifiers. */
export function sanitizeMeasuredPageTelemetryEvent<T extends { url: string; route?: string }>(
  event: T,
): T | null {
  try {
    const url = new URL(event.url);
    if (!measuredPaths.has(url.pathname) || !["https:", "http:"].includes(url.protocol))
      return null;
    url.search = "";
    url.hash = "";
    url.username = "";
    url.password = "";
    return { ...event, url: url.href, ...("route" in event ? { route: url.pathname } : {}) };
  } catch {
    return null;
  }
}
