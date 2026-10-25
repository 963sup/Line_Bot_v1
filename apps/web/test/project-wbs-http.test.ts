import assert from "node:assert/strict";
import { test } from "node:test";
import { createProjectWbs } from "@line_bot_v1/wbs/application/use-cases/project-content";
import type { ProjectWbsStore } from "@line_bot_v1/wbs/contracts/repositories/project-content";
import { WbsError } from "@line_bot_v1/wbs/domain/document";
import { projectWbsRequest } from "../src/modules/project/project-wbs-http.server";
import {
  projectWbsHistory,
  projectWbsReceipt,
  projectWbsView,
} from "../src/modules/project/project-wbs-response";

test("Project WBS HTTP checks origin, parses commands and keeps failure classes distinct", async (t) => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://example.com";
  t.after(() => {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  });
  const calls: unknown[] = [];
  const store: ProjectWbsStore = {
    read: async (...args) => {
      calls.push(args);
      throw new WbsError(404, "missing");
    },
    history: async () => ({ revisions: [], next: null }),
    transact: async () => {
      throw new WbsError(409, "stale");
    },
  };
  const service = createProjectWbs({
    activeUser: async () => ({ id: "user" }),
    store: () => store,
    now: () => 1,
  });
  const identity = async () => "verified-subject";
  const read = await projectWbsRequest(
    new Request("https://example.com/api/project-wbs?projectId=project"),
    service,
    identity,
  );
  assert.equal(read.status, 404);
  assert.deepEqual(calls, [["user", { projectId: "project" }, undefined]]);
  assert.equal(
    (
      await projectWbsRequest(
        new Request("https://example.com/api/project-wbs?projectId="),
        service,
        identity,
      )
    ).status,
    400,
  );
  const history = await projectWbsRequest(
    new Request("https://example.com/api/project-wbs/history?projectId=project&before=0"),
    service,
    identity,
    true,
  );
  assert.equal(history.status, 400);
  function write(origin: string, body: unknown) {
    return projectWbsRequest(
      new Request("https://example.com/api/project-wbs", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      service,
      identity,
    );
  }
  const command = {
    action: "initialize",
    projectId: "project",
    requestId: "11111111-1111-4111-8111-111111111111",
    expectedVersion: 0,
  };
  assert.equal((await write("https://attacker.test", command)).status, 403);
  assert.equal((await write("https://example.com", { ...command, actor: "spoof" })).status, 400);
  assert.equal((await write("https://example.com", command)).status, 409);
});

test("Project WBS HTTP rejects a missing Content disclosure and forged source details", async (t) => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://example.com";
  t.after(() => {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  });
  const store: ProjectWbsStore = {
    read: async () => {
      throw Error("unreachable");
    },
    history: async () => ({ revisions: [], next: null }),
    transact: async () => {
      throw new WbsError(409, "stale");
    },
  };
  const runtime = createProjectWbs({
    activeUser: async () => ({ id: "user" }),
    store: () => store,
    now: () => 1,
  });
  const valid = {
    action: "import-content-document",
    projectId: "project-a",
    requestId: "11111111-1111-4111-8111-111111111111",
    expectedVersion: 2,
    confirmedDisclosure: true,
    repositoryId: "repo-a",
    contentRevisionId: "33333333-3333-4333-8333-333333333333",
  };
  async function post(value: object) {
    return projectWbsRequest(
      new Request("https://example.com/api/project-wbs", {
        method: "POST",
        headers: { origin: "https://example.com", "content-type": "application/json" },
        body: JSON.stringify(value),
      }),
      runtime,
      async () => "actor",
    );
  }
  assert.equal((await post({ ...valid, confirmedDisclosure: false })).status, 400);
  assert.equal((await post({ ...valid, contentRevisionId: "bad" })).status, 400);
  assert.equal(
    (await post({ ...valid, contractId: "22222222-2222-4222-8222-222222222222" })).status,
    400,
  );
  assert.equal((await post(valid)).status, 409);
});

test("import-contract revisions survive Web receipt, current view and history decoding", () => {
  const revision = {
    id: "revision-2",
    version: 2,
    parentRevisionId: "revision-1",
    actorUserId: "writer",
    action: "import-contract",
    at: 100,
    document: { schemaVersion: 1, nodes: [] },
  };
  assert.equal(
    projectWbsReceipt({ requestId: "req", projectId: "project", revision }).revision.action,
    "import-contract",
  );
  const view = projectWbsView({
    actorUserId: "writer",
    project: { id: "project", title: "Project" },
    canEdit: true,
    canManageProject: false,
    closed: false,
    version: 2,
    revision,
  });
  assert.equal(view.revision?.action, "import-contract");
  assert.equal(
    projectWbsHistory({ revisions: [revision], next: null }).revisions[0]?.action,
    "import-contract",
  );
  assert.throws(() =>
    projectWbsReceipt({
      requestId: "req",
      projectId: "project",
      revision: { ...revision, action: "unknown" },
    }),
  );
});
