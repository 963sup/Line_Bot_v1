import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { record, stringValue } from "@line_bot_v1/platform/validation";
import type { ObjectWebRuntime } from "../src/modules/object/object-http.server";
import { objectRequest } from "../src/modules/object/object-http.server";
import { objectScope, objects, objectTypes } from "../src/modules/object/object-response";
import { RequestIdentityError } from "../src/shared/server/request-identity-error";

test("Object HTTP binds verified identity, Repository URL and exact commands", async (t) => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://example.test";
  t.after(() => {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  });
  const typeId = randomUUID();
  const type = {
    id: typeId,
    repositoryId: "repo",
    name: "Requirement",
    description: "Structured requirement",
    enabled: true,
    version: 1,
    createdAt: 1,
    updatedAt: 1,
  };
  const summary = {
    objectId: randomUUID(),
    repositoryId: "repo",
    revisionId: randomUUID(),
    version: 1,
    typeId,
    typeName: type.name,
    name: "Cooling requirement",
    archived: false,
    updatedAt: 2,
  };
  let captured: unknown;
  let capturedTypeAfter: string | undefined;
  const owner: ReturnType<ObjectWebRuntime["objects"]> = {
    listTypes: async (userId: string, query) => {
      assert.equal(userId, "user");
      capturedTypeAfter = query.after;
      return { items: [type], next: query.after ? null : "next-type" };
    },
    listObjects: async (userId: string) => {
      assert.equal(userId, "user");
      return { items: [summary], next: null };
    },
    readObject: async () => {
      throw new Error("unused");
    },
    history: async () => ({ items: [], next: null }),
    listRelationships: async () => ({ items: [], next: null }),
    relationshipHistory: async () => ({ items: [], next: null }),
    compareRevisions: async () => [],
    executeType: async (_userId: string, command: unknown) => {
      captured = command;
      const value = record(command);
      const kind = "type" as const;
      return {
        requestId: stringValue(value.requestId),
        kind,
        result: type,
      };
    },
    executeObject: async () => {
      throw new Error("unused");
    },
    executeRelationship: async () => {
      throw new Error("unused");
    },
  };
  const runtime: ObjectWebRuntime = {
    async scope(subject, selector) {
      assert.equal(subject, "verified-subject");
      assert.deepEqual(selector, { ownerLogin: "owner", repositoryName: "Objects" });
      return {
        actorUserId: "user",
        repository: { id: "repo", ownerLogin: "owner", name: "Objects" },
        archived: false,
        canEdit: true,
        canManageTypes: true,
        canManageRepository: true,
      };
    },
    objects: () => owner,
  };
  const base = "https://example.test/api/repository-object-types?owner=owner&name=Objects";
  const identity = async () => "verified-subject";
  const unauthorized = await objectRequest(new Request(base), "types", runtime, async () => {
    throw new RequestIdentityError(401, "login");
  });
  assert.equal(unauthorized.status, 401);
  const typeResponse = await objectRequest(new Request(base), "types", runtime, identity);
  assert.equal(typeResponse.status, 200);
  const typePayload: unknown = await typeResponse.json();
  assert.deepEqual(
    {
      actorUserId: objectScope(typePayload).actorUserId,
      canManageRepository: objectScope(typePayload).canManageRepository,
    },
    { actorUserId: "user", canManageRepository: true },
  );
  assert.equal(objectTypes(typePayload).types[0]?.name, "Requirement");
  assert.equal(objectTypes(typePayload).next, "next-type");
  await objectRequest(new Request(`${base}&after=next-type`), "types", runtime, identity);
  assert.equal(capturedTypeAfter, "next-type");
  const objectResponse = await objectRequest(
    new Request(
      "https://example.test/api/repository-objects?owner=owner&name=Objects&archived=false",
    ),
    "objects",
    runtime,
    identity,
  );
  assert.equal(objects(await objectResponse.json()).objects[0]?.name, "Cooling requirement");
  assert.equal(
    (
      await objectRequest(
        new Request(
          "https://example.test/api/repository-objects?owner=owner&name=Objects&archived=yes",
        ),
        "objects",
        runtime,
        identity,
      )
    ).status,
    400,
  );

  const command = {
    action: "create",
    repositoryId: "repo",
    typeId,
    requestId: randomUUID(),
    expectedVersion: 0,
    name: "Requirement",
    description: "Structured requirement",
  };
  const post = (body: unknown, origin = "https://example.test") =>
    objectRequest(
      new Request(base, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      "types",
      runtime,
      identity,
    );
  assert.equal((await post(command, "https://attacker.test")).status, 403);
  assert.equal((await post({ ...command, repositoryId: "other" })).status, 400);
  const committed = await post(command);
  assert.equal(committed.status, 200);
  assert.deepEqual(captured, command);
  assert.equal(stringValue(record(await committed.json()).requestId), command.requestId);
});
