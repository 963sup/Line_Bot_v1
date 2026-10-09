import assert from "node:assert/strict";
import { test } from "node:test";
import {
  postProjectCommand,
  requestProjectActor,
  requestProjectOwnerOrganizations,
  requestProjectUserByLogin,
  requestProjectUsers,
  requestProjectView,
} from "../src/modules/project/project-requests";

test("Project API requests use app-session generation instead of a LINE token", async () => {
  const sessionGeneration = "11111111-1111-4111-8111-111111111111";
  const responses: unknown[] = [
    { member: { id: "member-id", login: "member", status: "active" } },
    { items: [] },
    {},
    { users: [] },
    { user: { id: "candidate-id", login: "candidate" } },
    {},
  ];
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    const body = responses.shift();
    if (body === undefined) throw new Error("Unexpected Project API request.");
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await requestProjectActor(sessionGeneration);
    await requestProjectOwnerOrganizations(sessionGeneration);
    await requestProjectView(sessionGeneration, "project-id");
    await requestProjectUsers(sessionGeneration, "project-id", ["user-id"]);
    await requestProjectUserByLogin(sessionGeneration, "project-id", "candidate");
    await postProjectCommand(sessionGeneration, {} as never);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 6);
  for (const { init } of requests) {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("x-app-session-generation"), sessionGeneration);
    assert.equal(headers.get("x-line-token"), null);
  }
});
