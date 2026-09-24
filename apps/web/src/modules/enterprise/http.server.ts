import { UserError } from "@line-work/account/domain/user";
import { EnterpriseError } from "@line-work/enterprise/domain";
import { GovernanceAccessError } from "@line-work/identity-access/domain/role-assignment";
import { captureHandledServerError } from "../../shared/observability/server-error";
import { BodyTooLargeError, jsonResponse, readBodyText } from "../../shared/server/http";
import { RequestIdentityError } from "../../shared/server/request-identity-error";

class EnterpriseHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function enterpriseRequest(
  request: Request,
  provider: () => string,
  requestIdentity: () => Promise<string>,
  execute: (actor: { provider: string; subject: string }, body: unknown) => Promise<unknown>,
  view: (
    actor: { provider: string; subject: string },
    selector: { id?: string; slug?: string },
  ) => Promise<unknown>,
) {
  try {
    const actor = { provider: provider(), subject: await requestIdentity() };
    if (request.method === "GET") {
      const params = new URL(request.url).searchParams;
      const id = params.get("id") ?? undefined;
      const slug = params.get("slug") ?? undefined;
      if (id && slug) throw new EnterpriseHttpError(400, "Enterprise locator 不正確。");
      return jsonResponse(await view(actor, { id, slug }));
    }
    const origin = process.env.APP_ORIGIN ?? "";
    if (!origin || !origin.startsWith("https://") || new URL(origin).origin !== origin)
      throw new EnterpriseHttpError(503, "服務網址尚未設定。");
    if (request.headers.get("origin") !== origin)
      throw new EnterpriseHttpError(403, "來源不符，請重新開啟。");
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
      throw new EnterpriseHttpError(415, "需要 JSON 格式。");
    const text = await readBodyText(request, 65536);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new EnterpriseError("invalid-input", "JSON 格式錯誤。");
    }
    return jsonResponse(await execute(actor, body));
  } catch (error) {
    const known =
      error instanceof EnterpriseError ||
      error instanceof UserError ||
      error instanceof GovernanceAccessError ||
      error instanceof RequestIdentityError;
    const status =
      error instanceof EnterpriseHttpError
        ? error.status
        : known
          ? ((error as { status?: number }).status ?? 400)
          : error instanceof BodyTooLargeError
            ? 413
            : 503;
    captureHandledServerError(error, {
      service: "enterprise-api",
      operation: "request",
      status,
    });
    return jsonResponse(
      {
        error:
          error instanceof EnterpriseHttpError || known
            ? (error as Error).message
            : status === 413
              ? "內容過大。"
              : "企業服務暫不可用，請稍後重試。",
        retryable: status >= 500 || status === 429,
      },
      status,
    );
  }
}
