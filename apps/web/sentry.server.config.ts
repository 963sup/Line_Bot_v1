import * as Sentry from "@sentry/nextjs";
import {
  sentryPrivacyOptions,
  serverSentryEnabled,
} from "./src/shared/observability/sentry-policy";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: serverSentryEnabled(process.env),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  ...sentryPrivacyOptions(),
});
