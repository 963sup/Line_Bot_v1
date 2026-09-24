import { UserError } from "@line-work/account/domain/user";
import { GovernanceAccessError } from "@line-work/identity-access/domain/role-assignment";
import { TeamError } from "@line-work/team/domain";
import { captureHandledServerError } from "../../shared/observability/server-error";
import { BodyTooLargeError, jsonResponse, readBodyText } from "../../shared/server/http";
import { RequestIdentityError } from "../../shared/server/request-identity-error";

export function teamQuery(request: Request) {
  const search = new URL(request.url).searchParams;
  const allowed = new Set(["organizationAccountId", "teamId", "organizationLogin", "teamSlug"]);
  if (
    [...search.keys()].some((key) => !allowed.has(key)) ||
    [...allowed].some((key) => search.getAll(key).length > 1)
  ) {
    throw new TeamError(400, "查詢參數無效。");
  }

  const organizationAccountId = search.get("organizationAccountId") ?? "";
  const teamId = search.get("teamId") ?? "";
  const organizationLogin = search.get("organizationLogin") ?? "";
  const teamSlug = search.get("teamSlug") ?? "";
  const byLocator = Boolean(organizationLogin || teamSlug);
  if (byLocator) {
    if (!organizationLogin || !teamSlug || organizationAccountId || teamId) {
      throw new TeamError(400, "Team locator 不正確。");
    }
    return { kind: "locator" as const, organizationLogin, teamSlug };
  }
  return { kind: "id" as const, organizationAccountId, teamId };
}

export async function teamBody(request: Request) {
  const origin = process.env.APP_ORIGIN ?? "";
  if (!origin || !origin.startsWith("https://") || new URL(origin).origin !== origin)
    throw new TeamError(503, "服務網址尚未設定。");
  if (request.headers.get("origin") !== origin) throw new TeamError(403, "來源不符，請重新開啟。");
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
    throw new TeamError(415, "需要 JSON 格式。");
  const text = await readBodyText(request, 65536);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new TeamError(400, "JSON 格式錯誤。");
  }
}
export function teamApiError(error: unknown) {
  const known =
    error instanceof TeamError ||
    error instanceof GovernanceAccessError ||
    error instanceof UserError ||
    error instanceof RequestIdentityError;
  const status = known ? error.status : error instanceof BodyTooLargeError ? 413 : 503;
  captureHandledServerError(error, {
    service: "team-api",
    operation: "request",
    status,
  });
  return jsonResponse(
    {
      error: known
        ? error.message
        : status === 413
          ? "內容過大。"
          : "團隊服務暫不可用，請稍後重試。",
      retryable: status >= 500 || status === 429,
    },
    status,
  );
}
