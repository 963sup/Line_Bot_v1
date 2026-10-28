import assert from "node:assert/strict";
import { test } from "node:test";
import { repositoryRequestContext } from "../src/app/api/_composition/repository-request-context.server";
import { contentRequest } from "../src/modules/content/content-http.server";
import { contractsRequest } from "../src/modules/contract/contracts-http.server";
import { projectWbsFailure } from "../src/modules/project/project-wbs-transport.server";
import { repositoryFailure } from "../src/modules/repository/http.server";
import { resourcesRequest } from "../src/modules/resources/resources-http.server";

test("Content Contract File Repository Resources and WBS failures use runtime diagnostics without Sentry", async (t) => {
  const logs: string[] = [];
  t.mock.method(console, "error", (line: string) => {
    logs.push(line);
  });
  const cause = Object.assign(new Error("private failure"), {
    code: "23502",
    table: "contract_documents",
  });
  const fail = async (): Promise<never> => {
    throw cause;
  };
  const unused = (): never => {
    throw new Error("unexpected owner access");
  };
  const request = () => new Request("https://app.example/api?owner=owner&name=repo");
  const runtime = { scope: fail, owner: unused };
  await contentRequest(request(), runtime, fail);
  await contractsRequest(request(), runtime, fail);
  repositoryRequestContext("repository-files-api").observeError(cause, 500);
  repositoryFailure(cause);
  await resourcesRequest(request(), runtime, fail);
  projectWbsFailure(cause);
  assert.equal(logs.length, 6);
  const entries = logs.map((line) => JSON.parse(line));
  assert.deepEqual(
    entries.map((entry) => entry.service),
    [
      "repository-content-api",
      "repository-contracts-api",
      "repository-files-api",
      "repository-api",
      "repository-resources-api",
      "project-wbs-api",
    ],
  );
  for (const entry of entries) {
    assert.match(entry.traceId, /^[a-f0-9-]{36}$/);
    assert.equal(entry.errors[0].code, "23502");
  }
  assert.equal(logs.join("").includes("private failure"), false);
});

test("Next unhandled errors for detached API and page routes use runtime logs", async (t) => {
  const { onRequestError } = await import("../instrumentation");
  const logs: string[] = [];
  t.mock.method(console, "error", (line: string) => {
    logs.push(line);
  });
  for (const path of [
    "/api/repository-content",
    "/api/repository-contracts",
    "/api/repository-files",
    "/api/repository-resources",
    "/api/project-wbs/history",
    "/owner/repo",
  ]) {
    await onRequestError(
      new TypeError("Expected Contract lines"),
      { path, method: "GET", headers: {} },
      {
        routerKind: "App Router",
        routePath: path,
        routeType: "route",
        revalidateReason: undefined,
      },
    );
  }
  assert.equal(logs.length, 6);
  for (const line of logs) {
    const entry = JSON.parse(line);
    assert.equal(entry.service, "detached-request");
    assert.equal(entry.status, 500);
    assert.match(entry.traceId, /^[a-f0-9-]{36}$/);
  }
});
