import type { RichMenuDefinition } from "@line_bot_v1/line-channel/adapters/messaging";
import { miniAppEntryUrl } from "../../../shared/presentation/entry-route";

export const MENU_PAGES = ["attendance-in", "attendance-out"] as const;
export type MenuPage = (typeof MENU_PAGES)[number];

export function isMenuPage(value: string): value is MenuPage {
  return MENU_PAGES.some((page) => page === value);
}
export function menuAlias(page: MenuPage) {
  return `line_bot_v1-${page}`;
}
export function menuAsset(page: MenuPage) {
  return `line_bot_v1-${page}.png`;
}

type Rectangle = readonly [number, number, number, number];

export function lineBotV1RichMenu(
  miniAppUrl: string,
  size: { width: number; height: number },
  page: MenuPage = "attendance-in",
): RichMenuDefinition {
  const link = (intent: Parameters<typeof miniAppEntryUrl>[1]) =>
    miniAppEntryUrl(miniAppUrl, intent);
  const pixels = ([x, y, w, h]: Rectangle) => ({
    x: Math.round((size.width * x) / 100),
    y: Math.round((size.height * y) / 100),
    width: Math.round((size.width * (x + w)) / 100) - Math.round((size.width * x) / 100),
    height: Math.round((size.height * (y + h)) / 100) - Math.round((size.height * y) / 100),
  });
  const entries: Array<{ bounds: Rectangle; label: string; uri: string }> = [
    {
      bounds: [36.5, 25, 28.5, 48],
      label: page === "attendance-out" ? "下班" : "上班",
      uri: `${link("attendance")}&operation=${page === "attendance-out" ? "clock-out" : "clock-in"}`,
    },
    { bounds: [19.5, 20, 17, 23.5], label: "儲存庫", uri: link("repositories") },
    { bounds: [19.5, 53.5, 17, 23.5], label: "團隊協作", uri: link("partners") },
    { bounds: [42, 73.5, 17, 23], label: "個人", uri: link("profile") },
    { bounds: [65.5, 53.5, 15.5, 23.5], label: "通知中心", uri: link("notifications") },
  ];
  return {
    size,
    selected: true,
    name: `Line_Bot_v1-${page}`,
    chatBarText: "出勤操作",
    areas: entries.map(({ bounds, label, uri }) => ({
      bounds: pixels(bounds),
      action: { type: "uri", label, uri },
    })),
  };
}
