import * as Sentry from "@sentry/nextjs";
import { serverSentryEnabled } from "./sentry-policy";

export function shouldCaptureHandledServerError(status: number) {
  return status >= 500;
}

export function captureHandledServerError(
  error: unknown,
  context: {
    service: string;
    operation: string;
    status: number;
  },
) {
  if (!shouldCaptureHandledServerError(context.status) || !serverSentryEnabled(process.env)) return;
  Sentry.captureException(error, {
    tags: {
      service: context.service,
      operation: context.operation,
      http_status: String(context.status),
      handled: "true",
    },
  });
}
