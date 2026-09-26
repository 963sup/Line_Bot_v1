import { type EntryRoute, entryRoute } from "./entry-route";

type Destination = Exclude<EntryRoute, "pending" | "invalid">;
const paths: Record<Destination, string> = {
  workplaces: "/admin/workplaces",
  home: "/home",
  planned: "/planned",
  team: "/team",
  organizations: "/organizations",
  enterprises: "/enterprises",
  notifications: "/notifications",
  repositories: "/repositories",
  partners: "/partners",
  feedback: "/feedback",
  membership: "/settings",
  records: "/history",
  register: "/membership/register",
  restore: "/membership/restore",
  attendance: "/attendance",
  clockIn: "/attendance/clock-in",
  clockOut: "/attendance/clock-out",
  expense: "/expenses",
};

/** Called after LIFF init. Copy only business parameters into a fixed local destination. */
export function entryDestination(href: string, fallback: Destination = "home") {
  const route = entryRoute(href);
  if (route === "pending" || route === "invalid") return route;
  const selected = route === "home" ? fallback : route;
  const source = new URL(href);
  const target = new URL(paths[selected], source.origin);
  const feature = source.searchParams.get("feature");
  if (
    selected === "planned" &&
    source.searchParams.getAll("feature").length === 1 &&
    feature &&
    ["news", "partners", "referrals"].includes(feature)
  )
    target.searchParams.set("feature", feature);
  if (selected === "notifications" && source.pathname.startsWith(`${paths[selected]}/`)) {
    const id = source.pathname.slice(paths[selected].length + 1);
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))
      return "invalid";
    target.pathname = source.pathname;
  }
  if (selected === "notifications") {
    const notificationView = source.searchParams.get("notificationView");
    if (
      source.searchParams.getAll("notificationView").length === 1 &&
      notificationView &&
      ["all", "unread"].includes(notificationView)
    )
      target.searchParams.set("notificationView", notificationView);
  }
  if (selected === "partners") {
    const partnerView = source.searchParams.get("partnerView");
    if (
      source.searchParams.getAll("partnerView").length === 1 &&
      partnerView &&
      ["news", "directory", "referrals"].includes(partnerView)
    ) {
      if (partnerView === "news") target.pathname = "/partners/news";
      if (partnerView === "referrals") target.pathname = "/partners/referrals";
    }
  }
  if (selected === "attendance" && source.searchParams.has("operation")) {
    target.pathname = `/attendance/${source.searchParams.get("operation")!}`;
  }
  if (selected === "expense" && source.searchParams.has("expense"))
    target.searchParams.set("expense", source.searchParams.get("expense")!);
  if (selected === "membership" && source.searchParams.get("google") === "link")
    target.searchParams.set("google", "link");
  return target.pathname + target.search;
}

export function hasEntryContinuation(href: string) {
  const url = new URL(href);
  // LINE 外部登入也會帶回 camelCase 參數，不只有 liff.*。
  // 根入口必須啟動 SDK，讓它驗證登入回應並接續 google=link；
  // 這裡只辨識初始化需求，不讀取身分，也不自行導向 liffRedirectUri。
  return (
    entryRoute(href) !== "home" ||
    url.searchParams.has("liffClientId") ||
    url.searchParams.has("liffRedirectUri") ||
    [...url.searchParams.keys()].some((key) => key.startsWith("liff."))
  );
}
