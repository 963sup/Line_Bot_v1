import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { compileFunction } from "node:vm";
import ts from "typescript";
import { jsonResponse } from "../src/shared/server/http.js";

const projectId = "project-1";
const actorId = "actor-1";
const collaborators = [
  { kind: "USER", id: "collaborator-1", role: "WRITE" },
  { kind: "TEAM", id: "team-1", role: "READ" },
];

type ProjectView = {
  project: { creator: string | null };
  role: "READ" | "WRITE" | "ADMIN";
  collaborators: typeof collaborators;
  items: { draft: { assigneeIds: string[] } | null }[];
};

type Route = {
  GET(request: Request): Promise<Response>;
  runtime: string;
  dynamic: string;
};

function isRoute(value: unknown): value is Route {
  return (
    value !== null &&
    typeof value === "object" &&
    "GET" in value &&
    typeof value.GET === "function" &&
    "runtime" in value &&
    value.runtime === "nodejs" &&
    "dynamic" in value &&
    value.dynamic === "force-dynamic"
  );
}

function loadRoute(
  options: { role?: ProjectView["role"]; identity?: () => Promise<string>; actorId?: string } = {},
) {
  const calls: string[] = [];
  const view: ProjectView = {
    project: { creator: "creator-1" },
    role: options.role ?? "ADMIN",
    collaborators,
    items: [{ draft: { assigneeIds: ["assignee-1"] } }],
  };
  const modules = new Map<string, unknown>();
  modules.set("@line_bot_v1/namespace", {
    normalizeAccountLogin(value: unknown) {
      if (typeof value !== "string" || !/^[a-z0-9-]{1,39}$/i.test(value)) {
        throw new Error("Invalid login");
      }
      return value.trim().toLowerCase();
    },
  });
  modules.set("@line_bot_v1/project/domain", {
    ProjectError: class ProjectError extends Error {
      constructor(
        public readonly status: number,
        message: string,
      ) {
        super(message);
      }
    },
  });
  modules.set("../../../../modules/project/http.server", {
    projectFailure(error: unknown) {
      const status =
        error && typeof error === "object" && "status" in error && typeof error.status === "number"
          ? error.status
          : 503;
      const message = error instanceof Error ? error.message : "Project service unavailable.";
      return jsonResponse({ error: message }, status);
    },
  });
  modules.set("../../../../shared/server/http", { jsonResponse });
  modules.set("../../_composition/project-management.server", {
    projectActorUserId: async (subject: string) => {
      calls.push(`actor:${subject}`);
      return options.actorId ?? actorId;
    },
    projectManagement: {
      view: async (subject: string, selectedProjectId: string) => {
        calls.push(`view:${subject}:${selectedProjectId}`);
        return view;
      },
    },
    projectUserById: async (id: string) => {
      calls.push(`by-id:${id}`);
      return id === "assignee-1" ? { id, login: "worker" } : { id, login: id };
    },
    projectUserByLogin: async (login: string) => {
      calls.push(`by-login:${login}`);
      return { id: "candidate-1", login };
    },
  });
  modules.set("../../_composition/request-identity.server", {
    requestLineIdentity: options.identity ?? (async () => "verified-subject"),
  });

  const source = readFileSync(
    new URL("../src/app/api/project-management/users/route.ts", import.meta.url),
    "utf8",
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const loadedModule: { exports: unknown } = { exports: {} };
  compileFunction(outputText, ["require", "module", "exports"])(
    (name: string) => {
      if (!modules.has(name)) throw new Error(`Unexpected route dependency: ${name}`);
      return modules.get(name);
    },
    loadedModule,
    loadedModule.exports,
  );
  if (!isRoute(loadedModule.exports)) throw new Error("Route exports are incomplete.");
  return { route: loadedModule.exports, calls };
}

test("User login lookup is Project ADMIN-scoped and returns only the active User locator", async () => {
  const { route, calls } = loadRoute();
  const response = await route.GET(
    new Request(
      `https://example.test/api/project-management/users?projectId=${projectId}&login=Alex`,
    ),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { user: { id: "candidate-1", login: "alex" } });
  assert.deepEqual(calls, ["view:verified-subject:project-1", "by-login:alex"]);
});

test("non-admin Project collaborators cannot resolve invite candidates", async () => {
  const { route, calls } = loadRoute({ role: "WRITE" });
  const response = await route.GET(
    new Request(
      `https://example.test/api/project-management/users?projectId=${projectId}&login=Alex`,
    ),
  );
  assert.equal(response.status, 403);
  assert.deepEqual(calls, ["view:verified-subject:project-1"]);
});

test("User labels are limited to the current actor, Project collaborators and visible Draft assignees", async () => {
  const { route, calls } = loadRoute();
  const query = new URLSearchParams({ projectId });
  for (const id of [actorId, "collaborator-1", "assignee-1"]) query.append("userId", id);
  const response = await route.GET(
    new Request(`https://example.test/api/project-management/users?${query.toString()}`),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    users: [
      { id: actorId, login: actorId },
      { id: "collaborator-1", login: "collaborator-1" },
      { id: "assignee-1", login: "worker" },
    ],
  });
  assert.deepEqual(calls, [
    "view:verified-subject:project-1",
    `actor:verified-subject`,
    `by-id:${actorId}`,
    "by-id:collaborator-1",
    "by-id:assignee-1",
  ]);
});

test("unknown User IDs and malformed query shapes do not reach Account lookup", async () => {
  const unknown = loadRoute();
  const unknownResponse = await unknown.route.GET(
    new Request(
      `https://example.test/api/project-management/users?projectId=${projectId}&userId=unrelated-user`,
    ),
  );
  assert.equal(unknownResponse.status, 404);
  assert.deepEqual(unknown.calls, ["view:verified-subject:project-1", "actor:verified-subject"]);

  const malformed = loadRoute();
  const malformedResponse = await malformed.route.GET(
    new Request(
      `https://example.test/api/project-management/users?projectId=${projectId}&login=one&userId=collaborator-1`,
    ),
  );
  assert.equal(malformedResponse.status, 400);
  assert.deepEqual(malformed.calls, []);
});

test("identity verification runs before Project lookup", async () => {
  const { route, calls } = loadRoute({
    identity: async () => {
      throw Object.assign(new Error("請重新登入。"), { status: 401 });
    },
  });
  const response = await route.GET(
    new Request("https://example.test/api/project-management/users?projectId=&login=bad&extra=1"),
  );
  assert.equal(response.status, 401);
  assert.deepEqual(calls, []);
});
