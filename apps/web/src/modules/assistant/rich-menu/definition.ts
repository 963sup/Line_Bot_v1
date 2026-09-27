import type { RichMenuDefinition } from "@line-work/line-channel/adapters/messaging";
import { miniAppEntryUrl } from "../../../shared/presentation/entry-route";
import { DIARY_FORM_URL } from "../../diary/form";

const submenuPages = ["team", "forms", "notifications", "incident"] as const;
type SubmenuPage = (typeof submenuPages)[number];
const submenuOutPages = submenuPages.map((page) => `${page}-out` as const);
export const MENU_PAGES = [
  "home",
  "attendance-in",
  "attendance-out",
  ...submenuPages,
  ...submenuOutPages,
] as const;
export type MenuPage = (typeof MENU_PAGES)[number];
const submenuTitles: Record<SubmenuPage, string> = {
  team: "團隊協作",
  forms: "表單作業",
  notifications: "通知中心",
  incident: "異常通報",
};
function submenuPage(page: MenuPage): SubmenuPage | null {
  if (page === "home" || page === "attendance-in" || page === "attendance-out") return null;
  if (submenuPages.some((candidate) => candidate === page)) return page as SubmenuPage;
  return page.slice(0, -4) as SubmenuPage;
}
function menuTitle(page: MenuPage) {
  if (page === "home") return "主選單";
  if (page === "attendance-in" || page === "attendance-out") return "出勤操作";
  return submenuTitles[submenuPage(page)!];
}
export function isMenuPage(value: string): value is MenuPage {
  return MENU_PAGES.some((page) => page === value);
}
export function menuAlias(page: MenuPage) {
  return `work-assistant-${page}`;
}
export function menuAsset(page: MenuPage) {
  const imagePage =
    page === "home"
      ? "attendance-in"
      : page === "attendance-out"
        ? page
        : page.replace(/-out$/, "");
  return `work-assistant-${imagePage}.png`;
}
type Rectangle = readonly [number, number, number, number];
const ringPages = [
  "repositories",
  "incident",
  "forms",
  "team",
  "profile",
  "notifications",
] as const;
const ringBounds: Rectangle[] = [
  [19.5, 20, 17, 23.5],
  [42, 3, 17, 21],
  [65.5, 20, 15.5, 23.5],
  [19.5, 53.5, 17, 23.5],
  [42, 73.5, 17, 23],
  [65.5, 53.5, 15.5, 23.5],
];
const submenuBounds: Rectangle[] = [
  [12.5, 18.5, 75, 23.5],
  [12.5, 44.5, 75, 23.5],
  [12.5, 70.5, 75, 23.5],
];
export function workAssistantRichMenu(
  miniAppUrl: string,
  size: { width: number; height: number },
  page: MenuPage = "home",
): RichMenuDefinition {
  const link = (intent: Parameters<typeof miniAppEntryUrl>[1]) =>
    miniAppEntryUrl(miniAppUrl, intent);
  const attendance = (operation: string) =>
    `${link("attendance")}&operation=${encodeURIComponent(operation)}`;
  const entries: Record<SubmenuPage, Array<[string, string]>> = {
    team: [
      ["最新消息", `${link("partners")}&partnerView=news`],
      ["合作夥伴", `${link("partners")}&partnerView=directory`],
      ["夥伴推薦", `${link("partners")}&partnerView=referrals`],
    ],
    forms: [
      ["工作日誌", DIARY_FORM_URL],
      ["費用申請", "https://forms.gle/AySvenv4ELkFwB1z9"],
      ["請假申請", "https://forms.gle/E88kHQgRFcQ6YKyW6"],
    ],
    notifications: [
      ["全部通知", link("notifications")],
      ["未讀通知", `${link("notifications")}&notificationView=unread`],
      ["儲存庫", link("repositories")],
    ],
    incident: [
      ["現場稽核", "https://forms.gle/AQFKUZdDyJNUVCLf6"],
      ["異常回報", "https://forms.gle/8S5rFMBNdgtS7MDg9"],
      ["改善處理", "https://forms.gle/3pNwehhx2Gv33V3t8"],
    ],
  };
  const pixels = ([x, y, w, h]: Rectangle) => ({
    x: Math.round((size.width * x) / 100),
    y: Math.round((size.height * y) / 100),
    width: Math.round((size.width * (x + w)) / 100) - Math.round((size.width * x) / 100),
    height: Math.round((size.height * (y + h)) / 100) - Math.round((size.height * y) / 100),
  });
  const switchAction = (
    target: MenuPage,
    label: string,
  ): RichMenuDefinition["areas"][number]["action"] => ({
    type: "richmenuswitch",
    label,
    richMenuAliasId: menuAlias(target),
    data: `menu=${target}`,
  });
  const submenu = submenuPage(page);
  const working = page === "attendance-out" || page.endsWith("-out");
  return {
    size,
    selected: true,
    name: `工作助手-${page}`,
    chatBarText: menuTitle(page),
    areas:
      page === "home" || page === "attendance-in" || page === "attendance-out"
        ? [
            {
              bounds: pixels([36.5, 25, 28.5, 48]),
              action: {
                type: "uri" as const,
                label: page === "attendance-out" ? "下班" : "上班",
                uri: attendance(page === "attendance-out" ? "clock-out" : "clock-in"),
              },
            },
            ...ringPages.map((target, i) => ({
              bounds: pixels(ringBounds[i]!),
              action:
                target === "profile"
                  ? { type: "uri" as const, label: "個人", uri: link("profile") }
                  : target === "repositories"
                    ? { type: "uri" as const, label: "儲存庫", uri: link("repositories") }
                    : switchAction(
                        (working ? `${target}-out` : target) as MenuPage,
                        submenuTitles[target],
                      ),
            })),
          ]
        : [
            {
              bounds: pixels([0, 0, 32, 14]),
              action: switchAction(working ? "attendance-out" : "attendance-in", "返回主選單"),
            },
            ...entries[submenu!].map(([label, uri], i) => ({
              bounds: pixels(submenuBounds[i]!),
              action: { type: "uri" as const, label, uri },
            })),
          ],
  };
}
