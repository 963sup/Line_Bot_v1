import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import type { ErrorEvent } from "@sentry/nextjs";

/** Keep failure evidence while removing request/user payloads that can identify a person or carry secrets. */
export function sanitizeSentryEvent(event: ErrorEvent): ErrorEvent | null {
  const browserPath = typeof window === "undefined" ? undefined : window.location.pathname;
  const service = event.tags?.service;
  if (
    isSentryDetachedPath(event.request?.url) ||
    isSentryDetachedPath(browserPath) ||
    (typeof service === "string" &&
      [
        "repository-content-api",
        "repository-contracts-api",
        "repository-files-api",
        "repository-resources-api",
        "repository-document-intake-api",
        "repository-api",
        "repository-overview-page",
        "project-wbs-api",
      ].includes(service))
  )
    return null;
  const sanitized: ErrorEvent = { ...event };
  delete sanitized.user;
  delete sanitized.extra;
  delete sanitized.transaction;

  if (event.request) {
    const request = { ...event.request };
    delete request.headers;
    delete request.cookies;
    delete request.data;
    delete request.query_string;
    delete request.env;

    delete request.url;
    sanitized.request = request;
  }

  return sanitized;
}

export function sentryPrivacyOptions() {
  return {
    maxBreadcrumbs: 0,
    beforeSend: sanitizeSentryEvent,
    dataCollection: {
      userInfo: false,
      httpBodies: [],
      httpHeaders: false,
      cookies: false,
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      filePaths: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    },
  };
}

export function serverSentryEnabled(environment: Record<string, string | undefined>) {
  return environment.VERCEL === "1" && Boolean(environment.NEXT_PUBLIC_SENTRY_DSN);
}

/** Telemetry routing only; this never authorizes a route or changes its owner. */
export function isSentryDetachedPath(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 8192) return false;
  try {
    const url = new URL(value, "https://app.invalid");
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts[0] === "api") {
      return (
        parts[1] === "repositories" ||
        parts[1] === "project-wbs" ||
        /^repository-(?:content|contracts|files|resources|document-intake|wbs|overview|management|access|address|subscription|labels|milestones|wiki|insights)$/.test(
          parts[1] ?? "",
        )
      );
    }
    if (["repositories", "explore", "search", "stars", "trending"].includes(parts[0] ?? ""))
      return true;
    if (parts[0] === "projects" && parts.length >= 3 && parts[2] === "wbs") return true;
    normalizeAccountLogin(parts[0]);
    return (
      parts.length === 2 ||
      (parts.length >= 3 &&
        [
          "content",
          "contracts",
          "files",
          "resources",
          "wbs",
          "access",
          "settings",
          "labels",
          "milestones",
          "issues",
          "discussions",
          "wiki",
          "insights",
        ].includes(parts[2] ?? ""))
    );
  } catch {
    return false;
  }
}
