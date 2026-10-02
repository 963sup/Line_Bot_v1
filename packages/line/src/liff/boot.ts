"use client";

export type LiffSdk = {
  init: (options: { liffId: string }) => Promise<void>;
  isLoggedIn: () => boolean;
  login: (options?: { redirectUri: string }) => void;
  getProfile: () => Promise<{ userId: string; displayName: string; pictureUrl?: string }>;
  getAccessToken: () => string | null;
  isInClient: () => boolean;
  closeWindow: () => void;
  openWindow: (options: { url: string; external: boolean }) => void;
  use?: (plugin: unknown) => void;
};

export type LiffBootState = "initializing" | "ready" | "failed";

export type LiffBootOptions = {
  beforeInit?: (sdk: LiffSdk) => void | Promise<void>;
};

export type LiffBoot = {
  readonly liffId: string;
  readonly sdk: LiffSdk;
  ready: () => Promise<void>;
  retry: () => Promise<void>;
  state: () => LiffBootState;
};

const initializationError = "LINE 登入元件初始化失敗，請重試。";

/**
 * Start LIFF immediately when this function is called. UI/framework lifecycle is not part of
 * the boot contract. Consumers share one in-flight attempt and later calls retry a failed attempt.
 */
export function createLiffBoot(
  sdk: LiffSdk,
  liffId: string,
  options: LiffBootOptions = {},
): LiffBoot {
  if (!liffId) throw new Error("LINE 入口尚未設定。");

  let state: LiffBootState = "initializing";
  let attempt: Promise<void> | undefined;

  function start() {
    if (attempt) return attempt;
    state = "initializing";

    let operation: Promise<void>;
    try {
      const prepared = options.beforeInit?.(sdk);
      operation =
        prepared === undefined
          ? Promise.resolve(sdk.init({ liffId }))
          : Promise.resolve(prepared).then(() => sdk.init({ liffId }));
    } catch {
      operation = Promise.reject(new Error(initializationError));
    }

    const current = operation
      .then(() => {
        state = "ready";
      })
      .catch(() => {
        state = "failed";
        if (attempt === current) attempt = undefined;
        throw new Error(initializationError);
      });

    attempt = current;
    // Boot starts before a UI observer exists; attach a sink without changing the shared promise.
    void current.catch(() => {});
    return current;
  }

  start();

  return {
    liffId,
    sdk,
    ready: () => attempt ?? start(),
    retry: () => {
      if (state === "ready") return Promise.resolve();
      return attempt ?? start();
    },
    state: () => state,
  };
}
