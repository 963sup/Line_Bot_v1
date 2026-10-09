"use client";

import type { LiffBoot } from "./boot.js";

export function createLiffClient(
  resolveBoot: () => LiffBoot,
  href: () => string,
  loginReturnUrl: (href: string) => string,
) {
  let initialized = false;

  async function initialize(liffId?: string) {
    const boot = resolveBoot();
    const expectedId = liffId ?? boot.liffId;
    if (!expectedId) throw new Error("LINE 入口尚未設定。");
    if (expectedId !== boot.liffId) throw new Error("LINE 入口設定不一致。");
    await boot.ready();
    initialized = true;
    return !new URL(href()).searchParams.has("liff.state");
  }

  return {
    initialize,
    async accessToken(liffId?: string) {
      const boot = resolveBoot();
      if (!(await initialize(liffId ?? boot.liffId))) return null;
      if (!boot.sdk.isLoggedIn()) {
        boot.sdk.login({ redirectUri: loginReturnUrl(href()) });
        return null;
      }
      const token = boot.sdk.getAccessToken();
      if (!token) throw new Error("請從 LINE 重新開啟。");
      return token;
    },
    inClient: () => {
      const boot = resolveBoot();
      return initialized && boot.state() === "ready" && boot.sdk.isInClient();
    },
    profile: () => resolveBoot().sdk.getProfile(),
    close: () => resolveBoot().sdk.closeWindow(),
    openExternal: (url: string) => resolveBoot().sdk.openWindow({ url, external: true }),
  };
}
