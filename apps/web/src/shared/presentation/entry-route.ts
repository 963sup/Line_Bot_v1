import { isAttendanceOperation } from "./attendance-operation";
export type EntryRoute =
  | "planned"
  | "team"
  | "organizations"
  | "enterprises"
  | "workplaces"
  | "notifications"
  | "register"
  | "restore"
  | "records"
  | "repositories"
  | "partners"
  | "feedback"
  | "home"
  | "membership"
  | "clockIn"
  | "clockOut"
  | "attendance"
  | "expense"
  | "pending"
  | "invalid";

/** Read only after SDK initialization; LIFF owns decoding and redirecting liff.state. */
export function entryRoute(href: string): EntryRoute {
  const url = new URL(href);
  if (url.searchParams.has("liff.state")) return "pending";
  if (url.searchParams.has("handovers") || url.searchParams.has("meetings")) return "invalid";
  if (
    url.searchParams.has("operation") &&
    (url.searchParams.getAll("operation").length !== 1 ||
      url.searchParams.get("attendance") !== "1" ||
      !isAttendanceOperation(url.searchParams.get("operation")))
  )
    return "invalid";
  const names = [
    "workplaces",
    "planned",
    "team",
    "organizations",
    "enterprises",
    "notifications",
    "repositories",
    "partners",
    "feedback",
    "clockIn",
    "clockOut",
    "membership",
    "attendance",
    "expense",
    "records",
    "register",
    "restore",
  ];
  if (names.some((name) => url.searchParams.getAll(name).length > 1)) return "invalid";
  const supplied = names.filter((name) => url.searchParams.has(name));
  if (supplied.length > 1) return "invalid";
  if (url.searchParams.has("expense"))
    return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      url.searchParams.get("expense") ?? "",
    )
      ? "expense"
      : "invalid";
  if (url.searchParams.has("attendance"))
    return url.searchParams.get("attendance") === "1" ? "attendance" : "invalid";
  if (url.searchParams.has("membership"))
    return url.searchParams.get("membership") === "1" ? "membership" : "invalid";
  for (const page of [
    "workplaces",
    "planned",
    "team",
    "organizations",
    "enterprises",
    "notifications",
    "repositories",
    "partners",
    "feedback",
    "clockIn",
    "clockOut",
    "records",
    "register",
    "restore",
  ] as const) {
    if (url.searchParams.has(page)) return url.searchParams.get(page) === "1" ? page : "invalid";
  }
  return "home";
}

/** Never copy credential-bearing SDK parameters or arbitrary redirect targets into local entry URLs. */
export function entryReturnUrl(href: string) {
  const current = new URL(href);
  const target = new URL(current.pathname, current.origin);
  const feature = current.searchParams.get("feature");
  if (
    current.searchParams.getAll("feature").length === 1 &&
    feature &&
    ["news", "partners", "referrals"].includes(feature)
  )
    target.searchParams.set("feature", feature);
  const notificationView = current.searchParams.get("notificationView");
  if (
    current.searchParams.getAll("notificationView").length === 1 &&
    notificationView &&
    ["all", "unread"].includes(notificationView)
  )
    target.searchParams.set("notificationView", notificationView);
  const issueView = current.searchParams.get("issueView");
  if (
    current.searchParams.getAll("issueView").length === 1 &&
    issueView &&
    ["all", "mine", "created"].includes(issueView)
  )
    target.searchParams.set("issueView", issueView);
  const partnerView = current.searchParams.get("partnerView");
  if (
    current.searchParams.getAll("partnerView").length === 1 &&
    partnerView &&
    ["news", "directory", "referrals"].includes(partnerView)
  )
    target.searchParams.set("partnerView", partnerView);
  for (const key of [
    "workplaces",
    "planned",
    "team",
    "organizations",
    "enterprises",
    "notifications",
    "repositories",
    "partners",
    "feedback",
    "membership",
    "attendance",
    "clockIn",
    "clockOut",
    "expense",
    "operation",
    "google",
    "records",
    "register",
    "restore",
  ]) {
    const value = current.searchParams.get(key);
    if (value !== null) target.searchParams.set(key, value);
  }
  return target;
}

/** LINE login reuses the same sanitized local continuation policy. */
export function loginReturnUrl(href: string) {
  return entryReturnUrl(href).href;
}

/** The Web product owns the operation names shared by menus, messages and entry continuation. */
export function miniAppEntryUrl(
  miniAppUrl: string,
  intent: Exclude<EntryRoute, "pending" | "invalid">,
  value = "1",
) {
  const url = new URL(miniAppUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "miniapp.line.me" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/\d+-[A-Za-z0-9_-]+$/.test(url.pathname)
  )
    throw new Error("Invalid LINE MINI App URL");
  if (intent !== "home") url.searchParams.set(intent, value);
  return url.href;
}
