"use client";
import "./sdk.js";

export function createLiffClient(
  sdk: () => Window["liff"],
  href: () => string,
  loginReturnUrl: (href: string) => string,
) {
  let initialization: Promise<void> | undefined;
  let configuredId: string | undefined;
  let initialized = false;
  async function initialize(liffId: string) {
    if (!liffId) throw new Error("LINE 入口尚未設定。");
    if (configuredId && configuredId !== liffId) throw new Error("LINE 入口設定不一致。");
    if (!initialization) {
      configuredId = liffId;
      initialization = Promise.resolve()
        .then(() => sdk().init({ liffId }))
        .then(() => {
          initialized = true;
        })
        .catch(() => {
          initialization = undefined;
          configuredId = undefined;
          throw new Error("LINE 登入元件初始化失敗，請重試。");
        });
    }
    await initialization;
    return !new URL(href()).searchParams.has("liff.state");
  }
  return {
    initialize,
    async session(liffId: string) {
      if (!(await initialize(liffId))) return null;
      if (!sdk().isLoggedIn()) {
        sdk().login({ redirectUri: loginReturnUrl(href()) });
        return null;
      }
      const token = sdk().getAccessToken();
      if (!token) throw new Error("請從 LINE 重新開啟。");
      return token;
    },
    inClient: () => initialized && sdk().isInClient(),
    profile: () => sdk().getProfile(),
    close: () => sdk().closeWindow(),
    openExternal: (url: string) => sdk().openWindow({ url, external: true }),
  };
}
