import * as Sentry from "@sentry/nextjs";
import { startLineMiniAppBoot } from "./src/shared/browser/liff-bootstrap";
import { sentryPrivacyOptions } from "./src/shared/observability/sentry-policy";
import { hasEntryContinuation } from "./src/shared/presentation/entry-destination";

if (hasEntryContinuation(location.href)) startLineMiniAppBoot();

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: process.env.NODE_ENV === "production" && Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  ...sentryPrivacyOptions(),
});
