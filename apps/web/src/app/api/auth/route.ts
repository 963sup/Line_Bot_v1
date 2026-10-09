import { BodyTooLargeError, jsonResponse, readBodyText } from "../../../shared/server/http";
import { RequestIdentityError } from "../../../shared/server/request-identity-error";
import {
  createLineSession,
  renewLineSession,
  revokeLineSession,
} from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class SessionRouteError extends Error {
  constructor(
    readonly status: 400 | 403 | 413 | 415 | 503,
    message: string,
  ) {
    super(message);
  }
}

function requireSameOrigin(request: Request) {
  const configured = process.env.APP_ORIGIN ?? "";
  let appUrl: URL;
  try {
    appUrl = new URL(configured);
  } catch {
    throw new SessionRouteError(503, "服務網址尚未設定。");
  }
  if (appUrl.protocol !== "https:" || appUrl.origin !== configured)
    throw new SessionRouteError(503, "服務網址必須是固定 HTTPS origin。");
  if (request.headers.get("origin") !== configured)
    throw new SessionRouteError(403, "來源不符，請重新開啟服務。");
}

function sessionResponse(body: unknown, cookie: string, status = 200) {
  const response = jsonResponse(body, status);
  response.headers.set("Set-Cookie", cookie);
  return response;
}

function emptySessionResponse(cookie: string) {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Set-Cookie": cookie,
    },
  });
}

function errorResponse(error: unknown) {
  if (error instanceof SessionRouteError || error instanceof RequestIdentityError)
    return jsonResponse({ error: error.message }, error.status);
  return jsonResponse({ error: "登入服務暫不可用，請稍後重試。" }, 503);
}

async function accessToken(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
    throw new SessionRouteError(415, "資料格式不正確。");
  let body: unknown;
  try {
    body = JSON.parse(await readBodyText(request, 8192));
  } catch (error) {
    if (error instanceof BodyTooLargeError) throw new SessionRouteError(413, "資料過大。");
    throw new SessionRouteError(400, "資料格式不正確。");
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    typeof (body as Record<string, unknown>).accessToken !== "string"
  ) {
    throw new SessionRouteError(400, "LINE 登入憑證格式不正確。");
  }
  return (body as { accessToken: string }).accessToken;
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const lineToken = await accessToken(request);
    const session = await createLineSession(lineToken, request);
    return sessionResponse(
      { generation: session.generation, sessionChanged: session.sessionChanged },
      session.cookie,
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const session = await renewLineSession(request);
    return sessionResponse({ generation: session.generation }, session.cookie);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    const session = await revokeLineSession(request);
    return emptySessionResponse(session.cookie);
  } catch (error) {
    return errorResponse(error);
  }
}
