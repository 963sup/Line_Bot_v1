import assert from "node:assert/strict";
import { test } from "node:test";
import { createProjectUsers } from "../src/application/queries/project-users.js";
import { ProjectError } from "../src/domain.js";

function fixture(role: "READ" | "WRITE" | "ADMIN" = "ADMIN") {
  const calls: string[] = [];
  const deps: Parameters<typeof createProjectUsers>[0] = {
    view: async (subject, projectId) => {
      calls.push(`view:${subject}:${projectId}`);
      return {
        project: { creator: "creator" },
        role,
        collaborators: [
          { kind: "USER", id: "collaborator" },
          { kind: "TEAM", id: "team" },
        ],
        items: [{ draft: { assigneeIds: ["assignee"] } }, { draft: null }],
      };
    },
    actorUserId: async () => "actor",
    userByLogin: async (login) => {
      calls.push(`login:${login}`);
      return login === "missing" ? null : { id: "candidate", login };
    },
    userById: async (id) => {
      calls.push(`id:${id}`);
      return id === "creator" ? null : { id, login: id };
    },
  };
  return { calls, deps, read: createProjectUsers(deps) };
}

test("Project invitation lookup requires current ADMIN authority before Account lookup", async () => {
  for (const role of ["READ", "WRITE"] as const) {
    const { calls, read } = fixture(role);
    await assert.rejects(
      read("subject", { projectId: "project", login: "Alice", userIds: [] }),
      (error) => error instanceof ProjectError && error.status === 403,
    );
    assert.deepEqual(calls, ["view:subject:project"]);
  }
  const { calls, read } = fixture();
  assert.deepEqual(await read("subject", { projectId: "project", login: "Alice", userIds: [] }), {
    user: { id: "candidate", login: "alice" },
  });
  assert.deepEqual(calls, ["view:subject:project", "login:alice"]);
});

test("Project label lookup admits only actor, creator, User collaborators and visible draft assignees", async () => {
  const { calls, read } = fixture("READ");
  assert.deepEqual(
    await read("subject", {
      projectId: "project",
      userIds: ["actor", "creator", "collaborator", "assignee"],
    }),
    {
      users: [
        { id: "actor", login: "actor" },
        { id: "creator", login: null },
        { id: "collaborator", login: "collaborator" },
        { id: "assignee", login: "assignee" },
      ],
    },
  );
  for (const forbidden of ["unrelated", "team"]) {
    calls.length = 0;
    await assert.rejects(
      read("subject", { projectId: "project", userIds: ["actor", forbidden] }),
      (error) => error instanceof ProjectError && error.status === 404,
    );
    assert.deepEqual(calls, ["view:subject:project"]);
  }
});

test("missing candidate, malformed login and revoked scope keep distinct failures", async () => {
  const { deps, read } = fixture();
  await assert.rejects(
    read("subject", { projectId: "project", login: "missing", userIds: [] }),
    (error) => error instanceof ProjectError && error.status === 404,
  );
  await assert.rejects(
    read("subject", { projectId: "project", login: "bad/login", userIds: [] }),
    (error) => error instanceof ProjectError && error.status === 400,
  );
  const failure = new ProjectError(403, "revoked");
  const revoked = createProjectUsers({
    ...deps,
    view: async () => {
      throw failure;
    },
  });
  await assert.rejects(
    revoked("subject", { projectId: "project", userIds: ["actor"] }),
    (error) => error === failure,
  );
});
