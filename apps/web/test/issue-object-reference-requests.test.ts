import assert from "node:assert/strict";
import test from "node:test";
import {
  confirmPendingObjectReference,
  postIssueObjectReference,
  requestAvailableObjects,
  requestIssueObjectReferences,
  restorePendingObjectReference,
  savePendingObjectReference,
} from "../src/modules/repository/issue-object-reference-requests.js";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

test("Issue Object request client preserves pinned revisions and follows Object cursors", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const requests: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, ...(init ? { init } : {}) });
    if (url.startsWith("/api/issue-collaboration?")) {
      return Response.json({
        issueId: "issue",
        repositoryId: "repo",
        version: 4,
        objectReferences: [
          {
            objectId: "object-a",
            revisionId: "revision-1",
            pinnedVersion: 1,
            name: "Requirement A",
            typeId: "type-a",
            typeName: "Requirement",
            archived: false,
            currentRevisionId: "revision-2",
            currentVersion: 2,
            hasNewerRevision: true,
          },
        ],
      });
    }
    if (url.includes("after=next-page")) {
      return Response.json({
        actorUserId: "actor",
        repository: { id: "repo" },
        items: [
          {
            objectId: "object-c",
            revisionId: "revision-c",
            typeName: "Requirement",
            name: "C",
            archived: false,
          },
        ],
        next: null,
      });
    }
    if (url.startsWith("/api/repository-objects?")) {
      return Response.json({
        actorUserId: "actor",
        repository: { id: "repo" },
        items: [
          {
            objectId: "object-b",
            revisionId: "revision-b",
            typeName: "Requirement",
            name: "B",
            archived: false,
          },
        ],
        next: "next-page",
      });
    }
    if (url === "/api/issue-collaboration" && init?.method === "POST") {
      return Response.json({
        requestId: "11111111-1111-4111-8111-111111111111",
        repositoryId: "repo",
        issueId: "issue",
        action: "set-object-reference",
        version: 5,
        resourceId: "object-b",
        data: { objectId: "object-b", revisionId: "revision-b" },
      });
    }
    return Response.json({ error: "unexpected" }, { status: 500 });
  };

  const view = await requestIssueObjectReferences("generation", "repo", "issue");
  assert.equal(view.version, 4);
  assert.equal(view.references[0]?.revisionId, "revision-1");
  assert.equal(view.references[0]?.hasNewerRevision, true);

  const objects = await requestAvailableObjects("generation", "owner", "repository");
  assert.equal(objects.actorUserId, "actor");
  assert.equal(objects.repositoryId, "repo");
  assert.deepEqual(
    objects.items.map((object) => object.objectId),
    ["object-b", "object-c"],
  );
  assert.match(requests[1]?.url ?? "", /owner=owner/);
  assert.match(requests[2]?.url ?? "", /after=next-page/);

  const command = {
    action: "set-object-reference" as const,
    requestId: "11111111-1111-4111-8111-111111111111",
    repositoryId: "repo",
    issueId: "issue",
    expectedVersion: 4,
    objectId: "object-b",
    revisionId: "revision-b",
  };
  const posted = await postIssueObjectReference("generation", command);
  assert.equal(posted.response.ok, true);
  assert.equal(
    typeof posted.value === "object" && posted.value !== null && "version" in posted.value
      ? posted.value.version
      : null,
    5,
  );
  assert.deepEqual(JSON.parse(String(requests[3]?.init?.body)), command);
  assert.equal(
    new Headers(requests[3]?.init?.headers).get("X-App-Session-Generation"),
    "generation",
  );
});

test("Issue Object pending retry is scoped to the verified actor, Repository and Issue", () => {
  const storage = memoryStorage();
  const operation = {
    actorUserId: "actor-a",
    repositoryId: "repo-a",
    issueId: "issue-a",
    command: {
      action: "set-object-reference" as const,
      requestId: "11111111-1111-4111-8111-111111111111",
      repositoryId: "repo-a",
      issueId: "issue-a",
      expectedVersion: 4,
      objectId: "object-a",
      revisionId: "revision-a",
    },
  };
  savePendingObjectReference(storage, operation);

  assert.equal(restorePendingObjectReference(storage, "actor-b", "repo-a", "issue-a"), null);
  assert.equal(restorePendingObjectReference(storage, "actor-a", "repo-b", "issue-a"), null);
  assert.equal(restorePendingObjectReference(storage, "actor-a", "repo-a", "issue-b"), null);
  assert.deepEqual(
    restorePendingObjectReference(storage, "actor-a", "repo-a", "issue-a"),
    operation,
  );
});

test("Issue Object picker rejects an actor switch across paginated scope", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let page = 0;
  globalThis.fetch = async () => {
    page += 1;
    return Response.json({
      actorUserId: page === 1 ? "actor-a" : "actor-b",
      repository: { id: "repo" },
      items: [],
      next: page === 1 ? "next" : null,
    });
  };

  await assert.rejects(
    requestAvailableObjects("generation", "owner", "repository"),
    /scope 已變更/,
  );
});

test("Issue Object wrong successful receipt retains the exact pending command", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const validReceipt = {
    requestId: "11111111-1111-4111-8111-111111111111",
    repositoryId: "repo",
    issueId: "issue",
    action: "set-object-reference",
    version: 5,
    resourceId: "object",
    data: { objectId: "object", revisionId: "revision" },
  };
  globalThis.fetch = async () => Response.json({ ...validReceipt, requestId: "different-request" });
  const storage = memoryStorage();
  const operation = {
    actorUserId: "actor",
    repositoryId: "repo",
    issueId: "issue",
    command: {
      action: "set-object-reference" as const,
      requestId: "11111111-1111-4111-8111-111111111111",
      repositoryId: "repo",
      issueId: "issue",
      expectedVersion: 4,
      objectId: "object",
      revisionId: "revision",
    },
  };
  savePendingObjectReference(storage, operation);
  const result = await postIssueObjectReference("generation", operation.command);
  assert.equal(result.response.ok, true);
  const wrongReceipts = [
    result.value,
    { ...validReceipt, repositoryId: "other-repository" },
    { ...validReceipt, issueId: "other-issue" },
    { ...validReceipt, action: "remove-object-reference" },
    { ...validReceipt, version: 6 },
    { ...validReceipt, resourceId: "other-object" },
    { ...validReceipt, data: { objectId: "other-object", revisionId: "revision" } },
    { ...validReceipt, data: { objectId: "object", revisionId: "other-revision" } },
  ];
  for (const receipt of wrongReceipts) {
    savePendingObjectReference(storage, operation);
    assert.throws(() => confirmPendingObjectReference(storage, operation, receipt), /回執不完整/);
    assert.deepEqual(restorePendingObjectReference(storage, "actor", "repo", "issue"), operation);
  }

  confirmPendingObjectReference(storage, operation, validReceipt);
  assert.equal(restorePendingObjectReference(storage, "actor", "repo", "issue"), null);
});

test("Issue Object request client rejects an incomplete pinned revision projection", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () =>
    Response.json({ issueId: "issue", repositoryId: "repo", version: 1, objectReferences: [{}] });
  await assert.rejects(
    requestIssueObjectReferences("generation", "repo", "issue"),
    /回應格式不正確/,
  );
});
