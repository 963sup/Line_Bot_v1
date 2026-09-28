import type { RichMenuDefinition } from "@line_bot_v1/line-channel/messaging";
import { miniAppEntryUrl } from "../../../shared/presentation/entry-route";

// Publication uses the same page keys for menu definitions, assets and aliases.
export const SUBMENU_PAGES = ["forms", "incident", "notifications", "team"] as const;
export const MENU_PAGES = ["attendance-in", "attendance-out", ...SUBMENU_PAGES] as const;
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
  const submenuLabels = {
    forms: "表單作業",
    incident: "異常通報",
    notifications: "公告通知",
    team: "團隊協作",
  };
  if (page !== "attendance-in" && page !== "attendance-out") {
    return {
      size,
      selected: true,
      name: `Line_Bot_v1-${page}`,
      chatBarText: submenuLabels[page],
      areas: [
        {
          bounds: pixels([4, 3, 12, 16]),
          action: { type: "postback", label: "返回出勤選單", data: "attendance-menu" },
        },
      ],
    };
  }
  const entries: Array<{ bounds: Rectangle; label: string; uri: string }> = [
    {
      bounds: [36.5, 25, 28.5, 48],
      label: page === "attendance-out" ? "下班" : "上班",
      uri: `${link("attendance")}&operation=${page === "attendance-out" ? "clock-out" : "clock-in"}`,
    },
    { bounds: [19.5, 20, 17, 23.5], label: "儲存庫", uri: link("repositories") },
    { bounds: [42, 73.5, 17, 23], label: "個人", uri: link("profile") },
  ];
  const submenus: Array<{ page: (typeof SUBMENU_PAGES)[number]; bounds: Rectangle }> = [
    { page: "forms", bounds: [65.5, 20, 15.5, 23.5] },
    { page: "incident", bounds: [42, 1.5, 17, 23] },
    { page: "notifications", bounds: [65.5, 53.5, 15.5, 23.5] },
    { page: "team", bounds: [19.5, 53.5, 17, 23.5] },
  ];
  return {
    size,
    selected: true,
    name: `Line_Bot_v1-${page}`,
    chatBarText: "出勤操作",
    areas: [
      ...entries.map(({ bounds, label, uri }) => ({
        bounds: pixels(bounds),
        action: { type: "uri" as const, label, uri },
      })),
      ...submenus.map(({ page: target, bounds }) => ({
        bounds: pixels(bounds),
        action: {
          type: "richmenuswitch" as const,
          label: submenuLabels[target],
          richMenuAliasId: menuAlias(target),
          data: `menu=${target}`,
        },
      })),
    ],
  };
}
