"use client";

import { createLiffClient } from "@line_bot_v1/line/liff";
import { loginReturnUrl } from "../presentation/entry-route";
import { lineMiniAppBoot } from "./liff-registry";

export const liffClient = createLiffClient(lineMiniAppBoot, () => location.href, loginReturnUrl);
