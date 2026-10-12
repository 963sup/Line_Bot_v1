import {
  bootLiff,
  createLiffBoot,
  type LiffBootOptions,
  type LiffSdk,
} from "@line_bot_v1/line/liff";
import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { isRecord } from "@line_bot_v1/platform/validation";
import { installLineMiniAppBoot } from "./liff-registry";

let mockInstalled = false;

function injectedLiff(): LiffSdk | undefined {
  const candidate: unknown = Reflect.get(globalThis, "liff");
  if (
    !isRecord(candidate) ||
    typeof candidate.init !== "function" ||
    typeof candidate.isLoggedIn !== "function" ||
    typeof candidate.login !== "function" ||
    typeof candidate.getProfile !== "function" ||
    typeof candidate.getAccessToken !== "function" ||
    typeof candidate.isInClient !== "function" ||
    typeof candidate.closeWindow !== "function" ||
    typeof candidate.openWindow !== "function"
  ) {
    return undefined;
  }
  const init = candidate.init;
  const isLoggedIn = candidate.isLoggedIn;
  const login = candidate.login;
  const getProfile = candidate.getProfile;
  const getAccessToken = candidate.getAccessToken;
  const isInClient = candidate.isInClient;
  const closeWindow = candidate.closeWindow;
  const openWindow = candidate.openWindow;
  return {
    init: (options) => Promise.resolve(Reflect.apply(init, candidate, [options])),
    isLoggedIn: () => Boolean(Reflect.apply(isLoggedIn, candidate, [])),
    login: (options) => Reflect.apply(login, candidate, [options]),
    getProfile: async () => {
      const profile: unknown = await Reflect.apply(getProfile, candidate, []);
      if (
        !isRecord(profile) ||
        typeof profile.userId !== "string" ||
        typeof profile.displayName !== "string" ||
        (profile.pictureUrl !== undefined && typeof profile.pictureUrl !== "string")
      )
        throw new Error("Synthetic LIFF profile is invalid.");
      return {
        userId: profile.userId,
        displayName: profile.displayName,
        ...(profile.pictureUrl === undefined ? {} : { pictureUrl: profile.pictureUrl }),
      };
    },
    getAccessToken: () => {
      const value: unknown = Reflect.apply(getAccessToken, candidate, []);
      return typeof value === "string" ? value : null;
    },
    isInClient: () => Boolean(Reflect.apply(isInClient, candidate, [])),
    closeWindow: () => Reflect.apply(closeWindow, candidate, []),
    openWindow: (options) => Reflect.apply(openWindow, candidate, [options]),
  };
}

function loopbackHost(hostname: string) {
  return new Set(["127.0.0.1", "localhost", "[::1]"]).has(hostname);
}

const mockOptions: LiffBootOptions | undefined =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_USE_LIFF_MOCK === "true"
    ? {
        mock: true,
        beforeInit: async (sdk) => {
          if (mockInstalled) return;
          const { LiffMockPlugin } = await import("@line/liff-mock");
          if (typeof sdk.use !== "function")
            throw new Error("LINE mock 元件載入失敗，請改用真實 LIFF SDK。");
          Reflect.apply(sdk.use, sdk, [new LiffMockPlugin()]);
          mockInstalled = true;
        },
      }
    : undefined;

export function startLineMiniAppBoot() {
  const liffId = lineMiniApp().liffId;
  const browserTestHarness =
    process.env.NEXT_PUBLIC_BROWSER_TEST_HARNESS === "true" && loopbackHost(location.hostname);
  const injected = browserTestHarness ? injectedLiff() : undefined;

  if (browserTestHarness && !injected) throw new Error("Synthetic LIFF test SDK is missing.");

  return installLineMiniAppBoot(
    injected ? createLiffBoot(injected, liffId) : bootLiff(liffId, mockOptions),
  );
}
