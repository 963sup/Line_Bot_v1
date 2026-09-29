import { UserError } from "@line_bot_v1/account/domain/user";
import type { NotificationError } from "@line_bot_v1/notifications/domain/error";
import { captureHandledServerError } from "../../../shared/observability/server-error";
import { BodyTooLargeError, jsonResponse, readBodyText } from "../../../shared/server/http";
import { RequestIdentityError } from "../../../shared/server/request-identity-error";
import { notifications } from "../_composition/notifications.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class NotificationRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function notificationFailure(error: NotificationError) {
  const status = {
    "invalid-notification-id": 400,
    "notification-not-found": 404,
  }[error.code];
  captureHandledServerError(error, {
    service: "notifications-api",
    operation: "request",
    status,
  });
  return jsonResponse({ error: error.message }, status);
}

function notificationId(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body) || !("id" in body)) return null;
  return typeof body.id === "string" ? body.id : null;
}

async function notificationRequest(request: Request) {
  try {
    const subject = await requestLineIdentity(request);
    if (request.method === "GET") {
      const params = new URL(request.url).searchParams;
      const result = await notifications.read(subject, {
        id: params.get("id") ?? undefined,
        unreadOnly: params.get("unread") === "1",
      });
      return result.ok ? jsonResponse(result.value) : notificationFailure(result.error);
    }

    const configured = process.env.APP_ORIGIN ?? "";
    if (
      !configured ||
      new URL(configured).protocol !== "https:" ||
      new URL(configured).origin !== configured
    ) {
      throw new NotificationRequestError(503, "通知網址尚未設定。");
    }
    if (request.headers.get("origin") !== configured) {
      throw new NotificationRequestError(403, "來源不符，請重新開啟通知頁。");
    }
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
      throw new NotificationRequestError(415, "請使用 JSON 格式。");
    }
    const text = await readBodyText(request, 4096);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new NotificationRequestError(400, "通知資料格式不正確。");
    }
    const id = notificationId(body);
    if (id === null) {
      throw new NotificationRequestError(400, "通知資料格式不正確。");
    }
    const result = await notifications.markRead(subject, { id });
    return result.ok
      ? jsonResponse({ notification: result.value })
      : notificationFailure(result.error);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return jsonResponse({ error: "通知資料過大。" }, 413);
    const known =
      error instanceof NotificationRequestError ||
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

export const GET = (request: Request) => notificationRequest(request);
export const POST = (request: Request) => notificationRequest(request);
