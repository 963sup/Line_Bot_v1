import { POST as createLineSession } from "../src/app/api/auth/route";

export async function lineSessionHeaders(
  accessToken: string,
  origin = process.env.APP_ORIGIN ?? "https://app.example",
) {
  const previousOrigin = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = origin;
  let response: Response;
  try {
    response = await createLineSession(
      new Request(`${origin}/api/auth`, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken }),
      }),
    );
  } finally {
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
  }
  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    throw new Error(body.error ?? `Unable to establish a test session (${response.status}).`);
  }
  const setCookie = response.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";", 1)[0];
  const body = (await response.json()) as { generation?: unknown };
  if (!cookie || typeof body.generation !== "string")
    throw new Error("The session endpoint did not issue its cookie and generation.");
  if (
    !setCookie.includes("HttpOnly") ||
    !setCookie.includes("Secure") ||
    !setCookie.includes("SameSite=Lax") ||
    !setCookie.includes("Path=/")
  )
    throw new Error("The session cookie is missing required security attributes.");
  return { Cookie: cookie, "X-App-Session-Generation": body.generation };
}
