"use client";

import type { bootLiff } from "@line_bot_v1/line/liff";

type LiffBoot = ReturnType<typeof bootLiff>;

let current: LiffBoot | undefined;

export function installLineMiniAppBoot(boot: LiffBoot) {
  if (current && current !== boot) {
    if (current.liffId !== boot.liffId) throw new Error("LINE 入口設定不一致。");
    return current;
  }
  current = boot;
  return boot;
}

export function lineMiniAppBoot() {
  return current;
}
