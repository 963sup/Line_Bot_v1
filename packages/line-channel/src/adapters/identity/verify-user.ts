/** Trusted LINE identity proof failure: caller proof is invalid or no longer usable. */
export class LineIdentityError extends Error {
  readonly status = 401;
}

/** LINE identity provider is unavailable or returned an unusable provider response. */
export class LineIdentityUnavailableError extends Error {
  readonly status = 503;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

const unavailableMessage = "LINE 身分驗證服務暫不可用，請稍後重試。";
const invalidMessage = "LINE 登入已失效，請重新開啟。";

async function lineRequest(request: typeof fetch, input: string, init: RequestInit) {
  try {
    return await request(input, init);
  } catch (error) {
    throw new LineIdentityUnavailableError(unavailableMessage, { cause: error });
  }
}

async function providerJson(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    throw new LineIdentityUnavailableError(unavailableMessage, { cause: error });
  }
}

function requireUsableResponse(response: Response) {
  if (response.ok) return;
  if (response.status === 429 || response.status >= 500) {
    throw new LineIdentityUnavailableError(unavailableMessage);
  }
  throw new LineIdentityError(invalidMessage);
}

/**
 * Verify a LIFF access token with LINE before any product use case receives the subject.
 * Caller-controlled identity is never trusted directly.
 */
export async function verifyLiffUser(
  token: string,
  channelId: string,
  request: typeof fetch = fetch,
): Promise<string> {
  if (!token || token.length > 4096 || !channelId) {
    throw new LineIdentityError("請從 LINE 重新開啟操作頁。");
  }

  const options = {
    signal: AbortSignal.timeout(5000),
    redirect: "error" as const,
    cache: "no-store" as const,
  };

  const verification = await lineRequest(
    request,
    `https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(token)}`,
    options,
  );
  requireUsableResponse(verification);
  const verified = await providerJson(verification);

  if (
    verified.client_id !== channelId ||
    !(typeof verified.expires_in === "number" && verified.expires_in > 0) ||
    !String(verified.scope).split(" ").includes("profile")
  ) {
    throw new LineIdentityError(invalidMessage);
  }

  const profileResponse = await lineRequest(request, "https://api.line.me/v2/profile", {
    ...options,
    headers: { Authorization: `Bearer ${token}` },
  });
  requireUsableResponse(profileResponse);
  const profile = await providerJson(profileResponse);

  if (typeof profile.userId !== "string" || !/^U[a-f0-9]{32}$/i.test(profile.userId)) {
    throw new LineIdentityUnavailableError(unavailableMessage);
  }

  return profile.userId;
}
