type NotificationOutcome = "accepted" | "retry" | "failed";

/** A single attempt. The caller owns persistent retry keys and scheduling. */
export async function pushLineText(
  token: string,
  subject: string,
  text: string,
  retryKey: string,
  fetcher: typeof fetch = fetch,
): Promise<NotificationOutcome> {
  if (!token) return "retry";
  if (
    !/^U[0-9a-f]{32}$/i.test(subject) ||
    !/^[0-9a-f-]{36}$/i.test(retryKey) ||
    !text ||
    text.length > 5000
  )
    return "failed";
  const response = await fetcher("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Line-Retry-Key": retryKey,
    },
    body: JSON.stringify({ to: subject, messages: [{ type: "text", text }] }),
    signal: AbortSignal.timeout(20000),
  });
  if (
    response.ok ||
    (response.status === 409 && !!response.headers.get("x-line-accepted-request-id"))
  )
    return "accepted";
  return response.status >= 500 || response.status === 429 ? "retry" : "failed";
}
