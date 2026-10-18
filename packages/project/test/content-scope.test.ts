import assert from "node:assert/strict";
import test from "node:test";
import { createSql, type SqlRow } from "@line_bot_v1/platform/postgres";
import { createPostgresProjectContentScope } from "../src/composition/bootstrap/project-content-scope.js";
import { ProjectError } from "../src/domain.js";

type AccessState = {
  active: boolean;
  public: boolean;
  closed: boolean;
  deleted: boolean;
  directRole: "READ" | "WRITE" | "ADMIN" | null;
  teamIds: string[];
  teamRole: "READ" | "WRITE" | "ADMIN" | null;
};

function projectRow(state: AccessState): SqlRow {
  return {
    id: "project-1",
    owner_account_id: "owner-1",
    owner_account_kind: "USER",
    number: 7,
    creator: "owner-1",
    name: "Delivery plan",
    short_description: "",
    readme: "",
    is_public: state.public,
    closed: state.closed,
    closed_at: state.closed ? 200 : null,
    deleted_at: state.deleted ? 300 : null,
    version: 1,
    created_at: 100,
    updated_at: 100,
  };
}

function scopeFor(state: AccessState, queries: string[] = []) {
  const sql = createSql(async (text) => {
    queries.push(text);
    if (text === "SELECT app_private.lock_governance('shared')") return { rows: [{}] };
    if (text.includes("FROM users WHERE id=$1")) {
      return {
        rows: state.active
          ? [
              {
                id: "user-1",
                status: "active",
                status_version: 1,
                auth_user_id: null,
                createdAt: 100,
              },
            ]
          : [],
      };
    }
    if (text.includes("pg_advisory_xact_lock")) return { rows: [{}] };
    if (text.includes("FROM projects") && text.includes("FOR UPDATE")) {
      return { rows: [projectRow(state)] };
    }
    if (text.includes("AS has_collaborator_grants")) {
      return {
        rows: [{ has_collaborator_grants: state.directRole !== null || state.teamRole !== null }],
      };
    }
    if (text.includes("FROM project_user_access")) {
      return { rows: state.directRole ? [{ role: state.directRole }] : [] };
    }
    if (text.includes("FROM team_effective_memberships")) {
      return { rows: state.teamIds.map((team_id) => ({ team_id })) };
    }
    if (text.includes("FROM project_team_access")) {
      return { rows: state.teamRole ? [{ role: state.teamRole }] : [] };
    }
    throw new Error(`unexpected query: ${text}`);
  });
  return createPostgresProjectContentScope(sql);
}

function privateState(): AccessState {
  return {
    active: true,
    public: false,
    closed: false,
    deleted: false,
    directRole: null,
    teamIds: [],
    teamRole: null,
  };
}

test("Project content scope exposes a public Project as READ", async () => {
  const state = { ...privateState(), public: true };

  assert.deepEqual(await scopeFor(state).read("user-1", "project-1"), {
    project: {
      id: "project-1",
      ownerAccountId: "owner-1",
      ownerKind: "USER",
      title: "Delivery plan",
      number: 7,
      public: true,
      hasCollaboratorGrants: false,
    },
    role: "READ",
    closed: false,
  });
});

test("Project content scope reads current direct and Team grants on every call", async () => {
  const direct: AccessState = { ...privateState(), directRole: "WRITE" };
  const directScope = scopeFor(direct);
  assert.deepEqual(
    await directScope.read("user-1", "project-1").then((scope) => ({
      role: scope.role,
      hasCollaboratorGrants: scope.project.hasCollaboratorGrants,
    })),
    { role: "WRITE", hasCollaboratorGrants: true },
  );
  direct.directRole = null;
  await assert.rejects(
    () => directScope.read("user-1", "project-1"),
    (error: unknown) => error instanceof ProjectError && error.status === 404,
  );

  const team: AccessState = {
    ...privateState(),
    teamIds: ["team-1"],
    teamRole: "ADMIN",
  };
  const teamScope = scopeFor(team);
  assert.deepEqual(
    await teamScope.read("user-1", "project-1").then((scope) => ({
      role: scope.role,
      hasCollaboratorGrants: scope.project.hasCollaboratorGrants,
    })),
    { role: "ADMIN", hasCollaboratorGrants: true },
  );
  team.teamIds = [];
  team.teamRole = null;
  await assert.rejects(
    () => teamScope.read("user-1", "project-1"),
    (error: unknown) => error instanceof ProjectError && error.status === 404,
  );
});

test("Project content scope reports closed state and hides deleted Projects", async () => {
  const closed = { ...privateState(), public: true, closed: true };
  assert.equal((await scopeFor(closed).read("user-1", "project-1")).closed, true);

  const deleted = { ...privateState(), public: true, deleted: true };
  await assert.rejects(
    () => scopeFor(deleted).read("user-1", "project-1"),
    (error: unknown) => error instanceof ProjectError && error.status === 404,
  );
});

test("Project content scope rejects inactive qualification before taking Project locks", async () => {
  const queries: string[] = [];
  const state = { ...privateState(), active: false, public: true };

  await assert.rejects(
    () => scopeFor(state, queries).read("user-1", "project-1"),
    (error: unknown) => error instanceof ProjectError && error.status === 403,
  );
  assert.equal(
    queries.some((query) => query.includes("pg_advisory_xact_lock")),
    false,
  );
  assert.equal(
    queries.some((query) => query.includes("FROM projects")),
    false,
  );
});

test("Project content scope recomputes access only after a contended Project row lock", async () => {
  const queries: string[] = [];
  let markStarted = () => {};
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  let releaseRowLock = () => {};
  const released = new Promise<void>((resolve) => {
    releaseRowLock = resolve;
  });
  const state = privateState();
  const sql = createSql(async (text) => {
    queries.push(text);
    if (text === "SELECT app_private.lock_governance('shared')") return { rows: [{}] };
    if (text.includes("FROM users WHERE id=$1")) {
      return {
        rows: [
          {
            id: "user-1",
            status: "active",
            status_version: 1,
            auth_user_id: null,
            createdAt: 100,
          },
        ],
      };
    }
    if (text.includes("pg_advisory_xact_lock")) return { rows: [{}] };
    if (text.includes("FROM projects") && text.includes("FOR UPDATE")) {
      markStarted();
      await released;
      return { rows: [projectRow(state)] };
    }
    if (text.includes("FROM project_user_access")) return { rows: [] };
    if (text.includes("FROM team_effective_memberships")) return { rows: [] };
    throw new Error(`unexpected query: ${text}`);
  });

  const read = createPostgresProjectContentScope(sql).read("user-1", "project-1");
  await started;
  assert.equal(
    queries.some((query) => query.includes("FROM project_user_access")),
    false,
  );
  releaseRowLock();
  await assert.rejects(
    read,
    (error: unknown) => error instanceof ProjectError && error.status === 404,
  );

  const governance = queries.findIndex((query) => query.includes("lock_governance('shared')"));
  const qualification = queries.findIndex((query) => query.includes("FROM users WHERE id=$1"));
  const advisory = queries.findIndex((query) => query.includes("pg_advisory_xact_lock"));
  const rowLock = queries.findIndex(
    (query) => query.includes("FROM projects") && query.includes("FOR UPDATE"),
  );
  const directGrant = queries.findIndex((query) => query.includes("FROM project_user_access"));
  const order = [governance, qualification, advisory, rowLock, directGrant];
  assert.ok(order.every((index) => index >= 0));
  assert.deepEqual(
    order,
    [...order].sort((left, right) => left - right),
  );
});
