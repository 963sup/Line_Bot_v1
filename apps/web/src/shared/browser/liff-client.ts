"use client";
import {
  bootLiff,
  createLiffClient,
  type LiffBootOptions,
} from "@line_bot_v1/line/liff";
import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { loginReturnUrl } from "../presentation/entry-route";

let mockInstalled = false;

const mockOptions: LiffBootOptions | undefined =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_USE_LIFF_MOCK === "true"
    ? {
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

const boot = bootLiff(lineMiniApp().liffId, mockOptions);

export const liffClient = createLiffClient(boot, () => location.href, loginReturnUrl);
