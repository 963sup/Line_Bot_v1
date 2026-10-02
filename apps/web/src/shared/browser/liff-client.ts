"use client";
import {
  bootLiff,
  createLiffBoot,
  createLiffClient,
  type LiffBootOptions,
  type LiffSdk,
} from "@line_bot_v1/line/liff";
import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { loginReturnUrl } from "../presentation/entry-route";

let mockInstalled = false;

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

const liffId = lineMiniApp().liffId;
const injected =
  process.env.NEXT_PUBLIC_USE_LIFF_MOCK === "true"
    ? (globalThis as typeof globalThis & { liff?: LiffSdk }).liff
    : undefined;
const boot = injected ? createLiffBoot(injected, liffId) : bootLiff(liffId, mockOptions);

export const liffClient = createLiffClient(boot, () => location.href, loginReturnUrl);
