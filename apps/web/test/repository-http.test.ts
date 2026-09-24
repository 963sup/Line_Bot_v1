import assert from "node:assert/strict";
import { test } from "node:test";
import { IssueError } from "@line-work/repository/domain";
import { issueBody, issueFailure } from "../src/modules/repository/http.server";
import { entryDestination } from "../src/shared/presentation/entry-destination";
import { loginReturnUrl } from "../src/shared/presentation/entry-route";

test("issue delivery rejects wrong origin, oversized body and malformed JSON", async () => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://example.com";
  const request = (body: string, origin = "https://example.com") =>
    new Request("https://example.com/api/issues", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body,
    });
  try {
    assert.deepEqual(await issueBody(request('{"action":"create"}')), { action: "create" });
    await assert.rejects(issueBody(request("{}", "https://attacker.example")), /工作助手/);
    await assert.rejects(issueBody(request("[]")), /格式/);
    await assert.rejects(issueBody(request("bad")), /格式/);
    await assert.rejects(issueBody(request("x".repeat(8193))), /過大/);
    const response = issueFailure(new IssueError(409, "版本衝突"));
    assert.equal(response.status, 409);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await issueFailure(new Error("private secret")).json(), {
      error: "Issue 服務暫時不可用，請稍後重試。",
    });
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});

test("repository entry preserves only fixed issue view intents without credentials", () => {
  for (const view of ["all", "mine", "created"]) {
    const href = `https://example.com/?repositories=1&issueView=${view}&token=secret`;
    assert.equal(entryDestination(href), `/repositories?issueView=${view}`);
    assert.equal(new URL(loginReturnUrl(href)).searchParams.get("issueView"), view);
    assert.equal(new URL(loginReturnUrl(href)).searchParams.has("token"), false);
  }
  assert.equal(
    entryDestination("https://example.com/?repositories=1&issueView=https://evil.example"),
    "/repositories",
  );
});
