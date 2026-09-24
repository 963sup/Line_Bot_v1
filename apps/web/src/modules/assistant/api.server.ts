import { UserError } from "@line-work/account/domain/user";
import { captureHandledServerError } from "../../shared/observability/server-error";
import { BodyTooLargeError, jsonResponse, readBodyText } from "../../shared/server/http";
import { RequestIdentityError } from "../../shared/server/request-identity-error";
import {
  assistantSurfaceConfig,
  isAssistantSurfaceMode,
  type AssistantSurfaceMode,
} from "./web-surface";

class AssistantRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type AssistantRunner = (
  subject: string,
  mode: AssistantSurfaceMode,
  input: string,
) => Promise<string>;

function configuredOrigin() {
  const configured = process.env.APP_ORIGIN ?? "";
  try {
    const value = new URL(configured);
    return value.protocol === "https:" && value.origin === configured ? configured : undefined;
  } catch {
    return undefined;
  }
}

export async function assistantRequest(
  request: Request,
  run: AssistantRunner,
  requestIdentity: () => Promise<string>,
) {
  try {
    const origin = configuredOrigin();
    if (!origin) throw new AssistantRequestError(503, "AI 網址尚未設定。");
    if (request.headers.get("origin") !== origin) {
      throw new AssistantRequestError(403, "來源不符，請重新開啟 AI 頁面。");
    }
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
      throw new AssistantRequestError(415, "請使用 JSON 格式。");
    }

    const text = await readBodyText(request, 4096);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new AssistantRequestError(400, "AI 請求格式不正確。");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AssistantRequestError(400, "AI 請求格式不正確。");
    }

    const keys = Object.keys(body);
    const candidate = body as { mode?: unknown; input?: unknown };
    if (
      keys.some((key) => key !== "mode" && key !== "input") ||
      !isAssistantSurfaceMode(candidate.mode) ||
      typeof candidate.input !== "string"
    ) {
      throw new AssistantRequestError(400, "AI 請求格式不正確。");
    }

    const input = candidate.input.trim();
    if (!input) throw new AssistantRequestError(400, "請輸入內容。");
    if (input.length > assistantSurfaceConfig[candidate.mode].maxLength) {
      throw new AssistantRequestError(400, "輸入內容超過此模式的長度限制。");
    }

    const subject = await requestIdentity();
    return jsonResponse({ text: await run(subject, candidate.mode, input) });
  } catch (error) {
    if (error instanceof BodyTooLargeError) return jsonResponse({ error: "AI 請求過大。" }, 413);
    const known =
      error instanceof AssistantRequestError ||
      error instanceof UserError ||
      error instanceof RequestIdentityError;
    const status = known ? error.status : 503;
    captureHandledServerError(error, {
      service: "assistant-api",
      operation: "request",
      status,
    });
    return known
      ? jsonResponse({ error: error.message }, status)
      : jsonResponse({ error: "AI 暫時不可用，請稍後重試。" }, status);
  }
}
