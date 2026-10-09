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
  lineSessionEstablished,
  lineSessionHintAvailable,
  onLineSessionBlocked,
  SessionBlockedError,
  startLineServiceSession,
} from "./line-service-session";

const providerClient = createLiffClient(
  () => lineMiniAppBoot() ?? startLineMiniAppBoot(),
  () => location.href,
  loginReturnUrl,
);

const {
  accessToken: getLineAccessToken,
  accessTokenIfLoggedIn: getLineAccessTokenIfLoggedIn,
  ...liffRuntime
} = providerClient;

async function establishServiceSession(liffId?: string, explicit = false) {
  if (explicit) allowLineServiceSession();
  const blocked = lineSessionBlocked();
  if (blocked) throw new SessionBlockedError(blocked);

  let restoreAttempted = false;
  if (!explicit) {
    if (lineSessionEstablished() || lineSessionHintAvailable()) {
      restoreAttempted = true;
      const restored = await ensureLineServiceSession();
      if (restored) return restored;
    }

    const lineAccessToken = await getLineAccessTokenIfLoggedIn(liffId);
    if (lineAccessToken) return startLineServiceSession(lineAccessToken);

    if (!restoreAttempted) {
      const restored = await ensureLineServiceSession();
      if (restored) return restored;
    }
  }

  const lineAccessToken = await getLineAccessToken(liffId);
  if (!lineAccessToken) return null;
  return startLineServiceSession(lineAccessToken);
}

export const liffClient = {
  ...liffRuntime,
  ensureSession: (liffId?: string) => establishServiceSession(liffId),
  startSession: (liffId?: string) => establishServiceSession(liffId, true),
  endSession: endLineServiceSession,
  onSessionBlocked: onLineSessionBlocked,
};
