import assert from "node:assert/strict";

const generation = "11111111-1111-4111-8111-111111111111";
const cookie =
  "__Host-line_bot_v1_session=synthetic-session; Path=/; HttpOnly; Secure; SameSite=Lax";

export async function fulfillLineSessionMock(route, onRequest = () => {}) {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname !== "/api/auth") return false;
  onRequest({ method: request.method() });

  if (request.method() === "GET") {
    const cookies = request.headers().cookie ?? "";
    const hasSession = cookies
      .split(";")
      .some((part) => part.trim() === "__Host-line_bot_v1_session=synthetic-session");
    await route.fulfill({
      status: hasSession ? 200 : 401,
      json: hasSession ? { generation } : { error: "服務登入已失效，請重新登入。" },
    });
    return true;
  }

  if (request.method() === "POST") {
    const body = request.postDataJSON();
    assert.deepEqual(Object.keys(body).sort(), ["accessToken"]);
    assert.equal(typeof body.accessToken, "string");
    assert.ok(body.accessToken.length > 0);
    await route.fulfill({
      json: { generation, sessionChanged: false },
      headers: { "Set-Cookie": cookie },
    });
    return true;
  }

  if (request.method() === "PATCH") {
    await route.fulfill({ json: { generation } });
    return true;
  }

  if (request.method() === "DELETE") {
    await route.fulfill({
      status: 204,
      headers: {
        "Set-Cookie":
          "__Host-line_bot_v1_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
      },
    });
    return true;
  }

  await route.fulfill({ status: 405, json: { error: "Synthetic method not allowed" } });
  return true;
}
