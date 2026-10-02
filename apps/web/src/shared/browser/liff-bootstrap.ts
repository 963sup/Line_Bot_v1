import {
  bootLiff,
  createLiffBoot,
  type LiffBootOptions,
  type LiffSdk,
} from "@line_bot_v1/line/liff";
import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { installLineMiniAppBoot } from "./liff-registry";

let mockInstalled = false;

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
          sdk.use(new LiffMockPlugin());
          mockInstalled = true;
        },
      }
    : undefined;

export function startLineMiniAppBoot() {
  const liffId = lineMiniApp().liffId;
  const browserTestHarness =
    process.env.NEXT_PUBLIC_BROWSER_TEST_HARNESS === "true" && loopbackHost(location.hostname);
  const injected = browserTestHarness
    ? (globalThis as typeof globalThis & { liff?: LiffSdk }).liff
    : undefined;

  if (browserTestHarness && !injected) throw new Error("Synthetic LIFF test SDK is missing.");

  return installLineMiniAppBoot(
    injected ? createLiffBoot(injected, liffId) : bootLiff(liffId, mockOptions),
  );
}
