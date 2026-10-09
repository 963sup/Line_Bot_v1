import { randomBytes, randomUUID } from "node:crypto";
import {
  LineIdentityError,
  LineIdentityUnavailableError,
  verifyLiffUser,
} from "@line_bot_v1/line/identity";
import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import {
  createUpstashRedisRestTransport,
  RedisRateLimiter,
  RedisSessionStore,
  RedisUnavailableError,
  redisUnavailableCode,
} from "@line_bot_v1/platform/redis";
import { RequestIdentityError } from "../../../shared/server/request-identity-error";
import { redisNamespace } from "../../../shared/server/runtime-environment";

const LINE_SESSION_COOKIE = "__Host-line_bot_v1_session";
const LINE_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

type SessionRecord = { subject: string; generation: string };
type StoredSession = { id: string; raw: string; record: SessionRecord };

interface SessionStore {
  create(id: string, value: string, seconds: number): Promise<boolean>;
  get(id: string): Promise<string | null>;
  update(id: string, expectedValue: string, value: string, seconds: number): Promise<boolean>;
  replace(previousId: string, nextId: string, value: string, seconds: number): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}

class DevelopmentSessionStore implements SessionStore {
  private readonly values = new Map<string, { value: string; expiresAt: number }>();

  async create(id: string, value: string, seconds: number) {
    if (await this.get(id)) return false;
    this.values.set(id, { value, expiresAt: Date.now() + seconds * 1000 });
    return true;
  }

  async get(id: string) {
    const current = this.values.get(id);
    if (!current) return null;
    if (current.expiresAt <= Date.now()) {
      this.values.delete(id);
      return null;
    }
    return current.value;
  }

  async update(id: string, expectedValue: string, value: string, seconds: number) {
    const current = this.values.get(id);
    if (!current || current.expiresAt <= Date.now() || current.value !== expectedValue)
      return false;
    this.values.set(id, { value, expiresAt: Date.now() + seconds * 1000 });
    return true;
  }

  async replace(previousId: string, nextId: string, value: string, seconds: number) {
    if (this.values.has(nextId)) return false;
    this.values.set(nextId, { value, expiresAt: Date.now() + seconds * 1000 });
    this.values.delete(previousId);
    return true;
  }

  async delete(id: string) {
    return this.values.delete(id);
  }
}

const state = globalThis as typeof globalThis & {
  redisLimiter?: RedisRateLimiter;
  redisSessions?: RedisSessionStore;
  developmentSessions?: DevelopmentSessionStore;
};

function requestProtectionTransport() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url && !token && process.env.NODE_ENV !== "production" && !process.env.VERCEL_ENV)
    return undefined;
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

function sessionStore(): SessionStore {
  const transport = requestProtectionTransport();
  if (transport) {
    state.redisSessions ??= new RedisSessionStore(redisNamespace(), transport);
    return state.redisSessions;
  }
  if (process.env.VERCEL_ENV) throw new RequestIdentityError(503, "登入服務暫不可用，請稍後重試。");
  state.developmentSessions ??= new DevelopmentSessionStore();
  return state.developmentSessions;
}

function readSessionId(request: Request) {
  const values = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${LINE_SESSION_COOKIE}=`));
  if (values.length !== 1) return null;
  const id = values[0]!.slice(LINE_SESSION_COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(id) ? id : null;
}

function parseSession(value: string): SessionRecord | null {
  if (value.length > 512) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const { subject, generation } = parsed as Record<string, unknown>;
    if (
      typeof subject !== "string" ||
      !/^U[a-f0-9]{32}$/i.test(subject) ||
      typeof generation !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(generation)
    )
      return null;
    return { subject, generation };
  } catch {
    return null;
  }
}

function sessionId() {
  return randomBytes(32).toString("base64url");
}

function serializeSession(record: SessionRecord) {
  return JSON.stringify(record);
}

function lineSessionCookie(id: string) {
  return `${LINE_SESSION_COOKIE}=${id}; Max-Age=${LINE_SESSION_TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function clearLineSessionCookie() {
  return `${LINE_SESSION_COOKIE}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

/** Exchange one verified LINE proof for an opaque, revocable application session. */
export async function createLineSession(lineToken: string, request: Request) {
  await limitRequest("member-api", lineToken);
  let subject: string;
  try {
    subject = await verifyLiffUser(lineToken, lineMiniApp().channelId);
  } catch (error) {
    if (error instanceof LineIdentityError) throw new RequestIdentityError(401, error.message);
    if (error instanceof LineIdentityUnavailableError)
      throw new RequestIdentityError(503, error.message, { cause: error });
    throw error;
  }

  try {
    const store = sessionStore();
    const previousId = readSessionId(request);
    const previousRaw = previousId ? await store.get(previousId) : null;
    const previous = previousRaw ? parseSession(previousRaw) : null;

    if (previousId && previousRaw && previous?.subject === subject) {
      if (await store.update(previousId, previousRaw, previousRaw, LINE_SESSION_TTL_SECONDS)) {
        return {
          generation: previous.generation,
          sessionChanged: false,
          cookie: lineSessionCookie(previousId),
        };
      }
    }

    if (previousId && previousRaw && !previous) await store.delete(previousId);
    for (let attempt = 0; attempt < 3; attempt++) {
      const id = sessionId();
      const record = { subject, generation: randomUUID() };
      const created = previousId
        ? await store.replace(previousId, id, serializeSession(record), LINE_SESSION_TTL_SECONDS)
        : await store.create(id, serializeSession(record), LINE_SESSION_TTL_SECONDS);
      if (created)
        return {
          generation: record.generation,
          sessionChanged: true,
          cookie: lineSessionCookie(id),
        };
    }
    throw new RequestIdentityError(503, "登入服務暫不可用，請稍後重試。");
  } catch (error) {
    if (error instanceof RequestIdentityError) throw error;
    if (error instanceof RedisUnavailableError) {
      throw new RequestIdentityError(503, "登入服務暫不可用，請稍後重試。", { cause: error });
    }
    throw new RequestIdentityError(503, "登入服務暫不可用，請稍後重試。", { cause: error });
  }
}

async function currentSession(request: Request): Promise<StoredSession> {
  const id = readSessionId(request);
  if (!id) throw new RequestIdentityError(401, "服務登入已失效，請重新登入。");
  const generation = request.headers.get("x-app-session-generation");
  if (
    !generation ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(generation)
  )
    throw new RequestIdentityError(401, "登入狀態已變更，請重新登入。");
  await limitRequest("member-api", id);
  try {
    const store = sessionStore();
    const raw = await store.get(id);
    const record = raw ? parseSession(raw) : null;
    if (!raw || !record) {
      if (raw) await store.delete(id);
      throw new RequestIdentityError(401, "服務登入已失效，請重新登入。");
    }
    if (record.generation !== generation)
      throw new RequestIdentityError(401, "登入帳號已切換，請重新載入後重試。");
    return { id, raw, record };
  } catch (error) {
    if (error instanceof RequestIdentityError) throw error;
    throw new RequestIdentityError(503, "登入服務暫不可用，請稍後重試。", { cause: error });
  }
}

/** Extend a valid service session without reusing or resending the LINE credential. */
export async function renewLineSession(request: Request) {
  const current = await currentSession(request);
  try {
    const renewed = await sessionStore().update(
      current.id,
      current.raw,
      current.raw,
      LINE_SESSION_TTL_SECONDS,
    );
    if (!renewed) throw new RequestIdentityError(401, "登入狀態已變更，請重新登入。");
    return {
      generation: current.record.generation,
      cookie: lineSessionCookie(current.id),
    };
  } catch (error) {
    if (error instanceof RequestIdentityError) throw error;
    throw new RequestIdentityError(503, "登入服務暫不可用，請稍後重試。", { cause: error });
  }
}

/** Revoke the current opaque service session. */
export async function revokeLineSession(request: Request) {
  const id = readSessionId(request);
  if (!id) return { cookie: clearLineSessionCookie() };
  try {
    // Revocation only needs the opaque cookie. It must also work after a page reload,
    // when the browser no longer has the in-memory generation marker.
    await sessionStore().delete(id);
    return { cookie: clearLineSessionCookie() };
  } catch (error) {
    if (error instanceof RequestIdentityError) throw error;
    throw new RequestIdentityError(503, "登出暫不可用，請稍後重試。", { cause: error });
  }
}

/** Resolves the verified LINE subject from the current app-owned session. */
export async function requestLineIdentity(request: Request) {
  return (await currentSession(request)).record.subject;
}
