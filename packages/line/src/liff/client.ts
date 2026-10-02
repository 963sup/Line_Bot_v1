"use client";

import type { LiffBoot } from "./boot.js";

export function createLiffClient(
  boot: LiffBoot,
  href: () => string,
  loginReturnUrl: (href: string) => string,
) {
  let initialized = false;

  async function initialize(liffId = boot.liffId) {
    if (!liffId) throw new Error("LINE 入口尚未設定。");
    if (liffId !== boot.liffId) throw new Error("LINE 入口設定不一致。");
    await boot.ready();
    initialized = true;
    return !new URL(href()).searchParams.has("liff.state");
  }

  return {
    initialize,
    async session(liffId = boot.liffId) {
      if (!(await initialize(liffId))) return null;
      if (!boot.sdk.isLoggedIn()) {
        boot.sdk.login({ redirectUri: loginReturnUrl(href()) });
        return null;
      }
      const token = boot.sdk.getAccessToken();
      if (!token) throw new Error("請從 LINE 重新開啟。");
      return token;
    },
    inClient: () => initialized && boot.state() === "ready" && boot.sdk.isInClient(),
    profile: () => boot.sdk.getProfile(),
    close: () => boot.sdk.closeWindow(),
    openExternal: (url: string) => boot.sdk.openWindow({ url, external: true }),
  };
}
