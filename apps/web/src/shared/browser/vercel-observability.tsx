"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { sanitizeMeasuredPageTelemetryEvent } from "./telemetry";

export function VercelObservability() {
  return (
    <>
      <Analytics beforeSend={sanitizeMeasuredPageTelemetryEvent} debug={false} />
      <SpeedInsights beforeSend={sanitizeMeasuredPageTelemetryEvent} debug={false} />
    </>
  );
}
