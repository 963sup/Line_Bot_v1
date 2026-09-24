import {
  LineIdentityError,
  LineIdentityUnavailableError,
  verifyLiffUser,
} from "@line-work/line-channel/adapters/identity";
import {
  createUpstashRedisRestTransport,
  RedisRateLimiter,
  RedisUnavailableError,
  redisUnavailableCode,
} from "@line-work/platform/adapters/redis";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { RequestIdentityError } from "../../../shared/server/request-identity-error";
import { redisNamespace } from "../../../shared/server/runtime-environment";

const state = globalThis as typeof globalThis & { redisLimiter?: RedisRateLimiter };

function requestProtectionTransport() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url && !token && !process.env.VERCEL_ENV) return undefined;
  if (!url || !token) throw new RedisUnavailableError("configuration");
  return createUpstashRedisRestTransport(url, token);
}

export async function limitRequest(scope: "member-api", token: string) {
  try {
    const transport = requestProtectionTransport();
    if (!transport) return;
    state.redisLimiter ??= new RedisRateLimiter(redisNamespace(), transport);
    const allowed = await state.redisLimiter.allow(scope, token, 300, 60);
    if (!allowed) throw new RequestIdentityError(429, "操作太頻繁，請稍候一分鐘再試。");
  } catch (error) {
    if (error instanceof RequestIdentityError) throw error;
    console.warn(
      JSON.stringify({
        service: "request-protection",
        outcome: "unavailable",
        code: redisUnavailableCode(error),
      }),
    );
    throw new RequestIdentityError(503, "請求保護服務暫不可用，請稍後再試。", {
      cause: error,
    });
  }
}

/** Validates delivery proof before any business use case receives the LINE subject. */
export async function requestLineIdentity(request: Request) {
  const lineToken = request.headers.get("x-line-token");
  if (!lineToken) throw new RequestIdentityError(401, "請重新登入 LINE。");
  await limitRequest("member-api", lineToken);
  try {
    return await verifyLiffUser(lineToken, lineMiniApp().channelId);
  } catch (error) {
    if (error instanceof LineIdentityError) throw new RequestIdentityError(401, error.message);
    if (error instanceof LineIdentityUnavailableError)
      throw new RequestIdentityError(503, error.message, { cause: error });
    throw error;
  }
}
