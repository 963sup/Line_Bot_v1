"use client";

import { createLiffClient } from "@line_bot_v1/line/liff";
import { loginReturnUrl } from "../presentation/entry-route";
import { startLineMiniAppBoot } from "./liff-bootstrap";
import { lineMiniAppBoot } from "./liff-registry";
import {
  allowLineServiceSession,
  endLineServiceSession,
  ensureLineServiceSession,
  lineSessionBlocked,
  onLineSessionBlocked,
  SessionBlockedError,
} from "./line-service-session";

const providerClient = createLiffClient(
  () => lineMiniAppBoot() ?? startLineMiniAppBoot(),
  () => location.href,
  loginReturnUrl,
);

const { accessToken: getLineAccessToken, ...liffRuntime } = providerClient;

async function establishServiceSession(liffId?: string, explicit = false) {
  if (explicit) allowLineServiceSession();
  const blocked = lineSessionBlocked();
  if (blocked) throw new SessionBlockedError(blocked);
  const lineAccessToken = await getLineAccessToken(liffId);
  if (!lineAccessToken) return null;
  return ensureLineServiceSession(lineAccessToken);
}

export const liffClient = {
  ...liffRuntime,
  ensureSession: (liffId?: string) => establishServiceSession(liffId),
  startSession: (liffId?: string) => establishServiceSession(liffId, true),
  endSession: endLineServiceSession,
  onSessionBlocked: onLineSessionBlocked,
};
