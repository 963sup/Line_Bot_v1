export type LineMiniAppStage = "developing" | "review" | "published";

export const CURRENT_LINE_MINI_APP_STAGE: LineMiniAppStage = "developing";

const urls: Record<LineMiniAppStage, string> = {
  developing: "https://miniapp.line.me/2011594976-EwkCszKu",
  review: "https://miniapp.line.me/2011594977-fUpeBs2q",
  published: "https://miniapp.line.me/2011594978-b2ktvto5",
};

export function parseLineMiniAppUrl(url: string) {
  const value = new URL(url);
  const match = /^\/(\d+)-([A-Za-z0-9_-]+)$/.exec(value.pathname);
  if (
    value.protocol !== "https:" ||
    value.hostname !== "miniapp.line.me" ||
    value.port ||
    value.username ||
    value.password ||
    value.search ||
    value.hash ||
    !match
  )
    throw new Error("Invalid LINE MINI App URL");
  const channelId = match[1];
  if (!channelId) throw new Error("Invalid LINE MINI App channel ID");
  return {
    url: value.origin + value.pathname,
    liffId: value.pathname.slice(1),
    channelId,
  };
}

export function lineMiniApp(stage = CURRENT_LINE_MINI_APP_STAGE) {
  return { stage, ...parseLineMiniAppUrl(urls[stage]) };
}
