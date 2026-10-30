import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createProjectManagement,
  parseProjectManagementCommand as parseApplicationCommand,
} from "../src/application/management.js";
import {
  type ProjectManagementCommand,
  parseProjectManagementCommand,
} from "../src/contracts/management.js";
import { ProjectError } from "../src/domain.js";

const requestId = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
const create = {
  action: "create-project",
  requestId,
  ownerAccountId: "owner",
  ownerKind: "USER",
  expectedVersion: 0,
  title: "  Recovery Project  ",
};

test("Project management contract and application expose the same canonical command parser", () => {
  assert.equal(parseApplicationCommand, parseProjectManagementCommand);
  assert.deepEqual(parseProjectManagementCommand(create), {
    ...create,
    requestId: requestId.toLowerCase(),
    title: "Recovery Project",
    public: false,
    repositoryId: null,
    teamId: null,
  });
  assert.deepEqual(
    parseProjectManagementCommand({
      ...create,
      repositoryId: "repo",
      importIssues: "OPEN",
      teamId: "team",
      public: true,
    }),
    {
      ...create,
      requestId: requestId.toLowerCase(),
      title: "Recovery Project",
      repositoryId: "repo",
      importIssues: "OPEN",
      teamId: "team",
      public: true,
    },
  );
});

test("Project management contract preserves validation status, messages and rejection order", () => {
  const invalid: readonly (readonly [unknown, string])[] = [
    [null, "Project 操作格式不正確。"],
    [[], "Project 操作格式不正確。"],
    [{ ...create, unknown: true, requestId: "invalid" }, "Project 操作含有未知欄位。"],
    [{ ...create, requestId: "invalid" }, "Project 請求編號不正確。"],
    [{ ...create, ownerAccountId: " owner" }, "Project owner 識別碼不正確。"],
    [{ ...create, ownerKind: "TEAM" }, "Project owner kind 不正確。"],
    [{ ...create, expectedVersion: -1 }, "Project 版本不正確。"],
    [{ ...create, expectedVersion: 1 }, "建立 Project 必須從版本 0 開始。"],
    [{ ...create, title: " " }, "Project title不正確。"],
    [{ ...create, title: "x".repeat(161) }, "Project title不正確。"],
    [{ ...create, public: "false" }, "Project public不正確。"],
    [{ ...create, repositoryId: " repo" }, "Repository 識別碼不正確。"],
    [{ ...create, importIssues: "OPEN" }, "匯入 Issues 必須指定 Repository。"],
    [{ ...create, repositoryId: "repo", importIssues: null }, "Issue 匯入條件不正確。"],
    [{ ...create, teamId: " team" }, "Team 識別碼不正確。"],
    [
      { action: "unknown", requestId, projectId: "project", expectedVersion: 1 },
      "Project 操作不正確。",
    ],
  ];
  for (const [raw, message] of invalid) {
    for (const parse of [parseProjectManagementCommand, parseApplicationCommand]) {
      assert.throws(
        () => parse(raw),
        (error: unknown) =>
          error instanceof ProjectError && error.status === 400 && error.message === message,
        message,
      );
    }
  }
});

test("Project management executes the canonical contract command", async () => {
  let received: ProjectManagementCommand | undefined;
  const management = createProjectManagement({
    activeUser: async () => ({ id: "actor" }),
    store: () => ({
      view: async () => {
        throw new Error("Unexpected view");
      },
      viewByNumber: async () => {
        throw new Error("Unexpected view by number");
      },
      execute: async (identity, command, now) => {
        assert.deepEqual(identity, { userId: "actor" });
        assert.equal(now, 42);
        received = command;
        return {
          requestId: command.requestId,
          action: command.action,
          projectId: "project",
          resourceId: null,
          version: 1,
          at: now,
          data: {},
        };
      },
    }),
    lifecycle: () => {
      throw new Error("Unexpected lifecycle command");
    },
    now: () => 42,
  });

  await management.command("subject", create);
  assert.deepEqual(received, parseProjectManagementCommand(create));
});
