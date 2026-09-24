import { UserError } from "@line-work/account/domain/user";
import type { createPartners } from "@line-work/partners/application/partners";
import { PartnerError } from "@line-work/partners/domain";
import { captureHandledServerError } from "../../shared/observability/server-error";
import { BodyTooLargeError, jsonResponse, readBodyText } from "../../shared/server/http";
import { RequestIdentityError } from "../../shared/server/request-identity-error";

export async function partnerRequest(
  request: Request,
  partners: ReturnType<typeof createPartners>,
  requestIdentity: () => Promise<string>,
) {
  try {
    if (request.method === "GET") {
      const view = new URL(request.url).searchParams.get("view");
      if (
        view !== null &&
        view !== "news" &&
        view !== "directory" &&
        view !== "referrals" &&
        view !== "manage"
      )
        throw new PartnerError(400, "夥伴檢視不正確。");
      return jsonResponse(
        await partners.view(
          await requestIdentity(),
          view ?? undefined,
          new URL(request.url).searchParams.get("after") ?? undefined,
        ),
      );
    }
    const origin = process.env.APP_ORIGIN ?? "";
    if (!origin || !origin.startsWith("https://") || new URL(origin).origin !== origin)
      throw new PartnerError(503, "夥伴服務網址尚未設定。");
    if (request.headers.get("origin") !== origin)
      throw new PartnerError(403, "來源不符，請重新開啟夥伴頁。");
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
      throw new PartnerError(415, "請使用 JSON 格式。");
    const text = await readBodyText(request, 65536);
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new PartnerError(400, "夥伴資料格式不正確。");
    }
    return jsonResponse(await partners.execute(await requestIdentity(), data));
  } catch (error) {
    if (error instanceof BodyTooLargeError) return jsonResponse({ error: "夥伴資料過大。" }, 413);
    const known =
      error instanceof PartnerError ||
      error instanceof UserError ||
      error instanceof RequestIdentityError;
    const status = known ? error.status : 503;
    captureHandledServerError(error, {
      service: "partners-api",
      operation: "request",
      status,
    });
    return known
      ? jsonResponse({ error: error.message }, status)
      : jsonResponse({ error: "夥伴服務暫不可用，請稍後重試。" }, status);
  }
}
