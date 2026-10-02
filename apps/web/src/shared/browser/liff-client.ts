"use client";
import { createLiffClient } from "@line_bot_v1/line/mini-app/browser";
import { loginReturnUrl } from "../presentation/entry-route";

export const liffClient = createLiffClient(
  () => window.liff,
  () => location.href,
  loginReturnUrl,
);
