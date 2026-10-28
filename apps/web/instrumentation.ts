import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";
import { logServerError } from "./src/shared/observability/runtime-error.server";
import { isSentryDetachedPath } from "./src/shared/observability/sentry-policy";

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  if (isSentryDetachedPath(request.path)) {
    logServerError(error, {
      service: "detached-request",
      operation: context.routeType,
      status: 500,
    });
    return;
  }
  return Sentry.captureRequestError(error, request, context);
};

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}
