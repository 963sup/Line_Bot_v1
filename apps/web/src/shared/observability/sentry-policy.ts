import type { ErrorEvent } from "@sentry/nextjs";

/** Keep failure evidence while removing request/user payloads that can identify a person or carry secrets. */
export function sanitizeSentryEvent(event: ErrorEvent): ErrorEvent {
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
