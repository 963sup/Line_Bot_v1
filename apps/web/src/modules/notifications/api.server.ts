import { UserError } from "@line-work/account/domain/user";
import type { createNotifications } from "@line-work/notifications/application/notifications";
import { NotificationError } from "@line-work/notifications/domain";
import { captureHandledServerError } from "../../shared/observability/server-error";
import { BodyTooLargeError, jsonResponse, readBodyText } from "../../shared/server/http";
import { RequestIdentityError } from "../../shared/server/request-identity-error";

export async function notificationRequest(
  request: Request,
  notifications: ReturnType<typeof createNotifications>,
  requestIdentity: () => Promise<string>,
) {
  try {
    const subject = await requestIdentity();
    if (request.method === "GET") {
      const params = new URL(request.url).searchParams;
      return jsonResponse(
        await notifications.read(subject, {
          id: params.get("id") ?? undefined,
          unreadOnly: params.get("unread") === "1",
        }),
      );
    }

    const configured = process.env.APP_ORIGIN ?? "";
    if (
      !configured ||
      new URL(configured).protocol !== "https:" ||
      new URL(configured).origin !== configured
    ) {
      throw new NotificationError(503, "通知網址尚未設定。");
    }
    if (request.headers.get("origin") !== configured) {
      throw new NotificationError(403, "來源不符，請重新開啟通知頁。");
    }
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
      throw new NotificationError(415, "請使用 JSON 格式。");
    }
    const text = await readBodyText(request, 4096);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new NotificationError(400, "通知資料格式不正確。");
    }
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      typeof (body as { id?: unknown }).id !== "string"
    ) {
      throw new NotificationError(400, "通知資料格式不正確。");
    }
    return jsonResponse({
      notification: await notifications.markRead(subject, (body as { id: string }).id),
    });
  } catch (error) {
    if (error instanceof BodyTooLargeError) return jsonResponse({ error: "通知資料過大。" }, 413);
    const known =
      error instanceof NotificationError ||
      error instanceof UserError ||
      error instanceof RequestIdentityError;
    const status = known ? error.status : 503;
    captureHandledServerError(error, {
      service: "notifications-api",
      operation: "request",
      status,
    });
    return known
      ? jsonResponse({ error: error.message }, status)
      : jsonResponse({ error: "通知服務暫不可用，請稍後重試。" }, status);
  }
}
