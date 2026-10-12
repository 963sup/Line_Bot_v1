"use client";

import liff from "@line/liff";
import { createLiffBoot, type LiffBoot, type LiffBootOptions } from "./boot.js";

let current: { liffId: string; boot: LiffBoot } | undefined;

/** One browser runtime owns one LIFF identity and one eager initialization lifecycle. */
export function bootLiff(liffId: string, options?: LiffBootOptions) {
  if (current) {
    if (current.liffId !== liffId) throw new Error("LINE 入口設定不一致。");
    return current.boot;
  }
  const boot = createLiffBoot(liff, liffId, options);
  current = { liffId, boot };
  return boot;
}
