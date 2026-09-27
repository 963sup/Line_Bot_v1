import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresUserStore } from "../src/adapters/postgres/user.js";
import type {
  GoogleLinkRepository,
  UserRepository,
} from "../src/application/ports/user-repository.js";
import { createGoogleLink, createUser, type UserDependencies } from "../src/application/user.js";
import { UserError } from "../src/domain/user.js";

const memberView = {
  id: "member-1",
  status: "active" as const,
  createdAt: 1,
  login: "alice",
  googleEmail: null,
};

function dependencies(repository: Partial<UserRepository>): UserDependencies {
  return {
    repository: () => repository as UserRepository,
    lineProvider: () => "line:provider",
  };
}

test("membership rejects anonymous and suspended provider subjects before protected ports", async () => {
  let found: { id: string; status: "suspended"; createdAt: number } | null = null;
  const active = createUser(dependencies({ find: async () => found })).activeLineUser;
  await assert.rejects(active("subject"), (e) => e instanceof UserError && e.status === 403);
  found = { id: "member-1", status: "suspended", createdAt: 1 };
  await assert.rejects(active("subject"), /停權/);
});

test("Namespace-reserved root keys cannot become Account logins", () => {
  const account = createUser(dependencies({}));
  for (const login of ["assistant", "daily-check-in"]) {
    assert.throws(
      () => account.registerUser("subject", login),
      (error) => error instanceof UserError && error.status === 400,
    );
  }
});

test("registration returns only the Account-owned committed projection", async () => {
  const calls: unknown[][] = [];
  const membership = createUser(
    dependencies({
      registerLine: async (...args) => {
        calls.push(["register", ...args]);
        return memberView;
      },
    }),
  );
  assert.deepEqual(await membership.registerUser("subject", " Alice "), memberView);
  assert.deepEqual(calls, [["register", "line:provider", "subject", "alice"]]);
});

test("membership queries stay lazy and do not expand an unknown provider subject", async () => {
  let repositories = 0;
  let views = 0;
  const deps = dependencies({
    find: async (provider, subject) => {
      assert.equal(provider, "line:provider");
      assert.equal(subject, "unknown");
      return null;
    },
    view: async () => {
      views++;
      return memberView;
    },
  });
  const membership = createUser({
    ...deps,
    repository: () => {
      repositories++;
      return deps.repository();
    },
  });
  assert.equal(repositories, 0);
  assert.equal(await membership.findUser("unknown"), null);
  assert.equal(await membership.getUser("unknown"), null);
  assert.equal(views, 0);
});

test("deactivate fails closed and lifecycle commands return their Account transaction result", async () => {
  let status: "active" | "suspended" = "suspended";
  let paused = false;
  const calls: unknown[][] = [];
  const membership = createUser(
    dependencies({
      find: async () => ({ id: "member-1", status, createdAt: 1 }),
      pause: async (...args) => {
        paused = true;
        calls.push(["pause", ...args]);
        return { ...memberView, status: "paused" };
      },
      restoreLine: async (...args) => {
        calls.push(["restore", ...args]);
        return memberView;
      },
    }),
  );
  await assert.rejects(membership.pauseUser("subject"));
  assert.equal(paused, false);
  status = "active";
  assert.deepEqual(await membership.pauseUser("subject"), { ...memberView, status: "paused" });
  assert.deepEqual(await membership.restoreUser("subject"), memberView);
  assert.deepEqual(calls, [
    ["pause", "member-1"],
    ["restore", "line:provider", "subject"],
  ]);
});

test("Google unlink stays an explicit optional identity operation", async () => {
  const calls: unknown[][] = [];
  const service = createGoogleLink({
    repository: () =>
      ({
        unlink: async (...args: unknown[]) => {
          calls.push(args);
        },
      }) as GoogleLinkRepository,
    lineProvider: () => "line:provider",
    now: () => 123,
  });
  await service.unlink("subject");
  assert.deepEqual(calls, [["line:provider", "subject", 123]]);
});

test("registration atomically claims a globally unique login", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  const store = new PostgresUserStore(db);
  const subjectA = `U${"1".repeat(32)}`;
  const subjectB = `U${"2".repeat(32)}`;

  const created = await store.registerLine("line:test", subjectA, "alice", 10);
  const retried = await store.registerLine("line:test", subjectA, "alice", 11);
  assert.equal(retried.id, created.id);

  const locator = await pg.query(
    "select account_kind,login from app_private.account_logins where account_id=$1",
    [created.id],
  );
  assert.deepEqual(locator.rows, [{ account_kind: "USER", login: "alice" }]);

  await assert.rejects(
    store.registerLine("line:test", subjectB, "alice", 12),
    (error) => error instanceof UserError && error.status === 409,
  );
  const secondIdentity = await pg.query(
    "select count(*)::int as count from app_private.user_identities where provider=$1 and subject=$2",
    ["line:test", subjectB],
  );
  assert.deepEqual(secondIdentity.rows, [{ count: 0 }]);
});

test("a User and login commit atomically while incomplete creation and login removal roll back", async (t) => {
  const { pg } = await postgresFixture();
  t.after(() => pg.close());

  await assert.rejects(
    pg.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
      "incomplete-user",
      "active",
      1,
    ]),
    (error) =>
      (error as { code?: string; message?: string }).code === "23514" &&
      Boolean((error as Error).message.includes("user_login_missing")),
  );
  const rolledBack = await pg.query(
    "select count(*)::int as count from app_private.users where id='incomplete-user'",
  );
  assert.deepEqual(rolledBack.rows, [{ count: 0 }]);

  await pg.transaction(async (sql) => {
    await sql.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
      "complete-user",
      "active",
      2,
    ]);
    await sql.query("select app_private.claim_account_login($1,'USER',$2,$3)", [
      "complete-user",
      "complete-user",
      2,
    ]);
  });
  await assert.rejects(
    pg.query("delete from app_private.account_logins where account_id='complete-user'"),
    (error) =>
      (error as { code?: string; message?: string }).code === "23514" &&
      Boolean((error as Error).message.includes("user_login_missing")),
  );
  const locator = await pg.query(
    "select login from app_private.account_logins where account_id='complete-user'",
  );
  assert.deepEqual(locator.rows, [{ login: "complete-user" }]);

  await pg.transaction(async (sql) => {
    await sql.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
      "second-user",
      "active",
      3,
    ]);
    await sql.query("select app_private.claim_account_login($1,'USER',$2,$3)", [
      "second-user",
      "second-user",
      3,
    ]);
  });
  await assert.rejects(
    pg.transaction(async (sql) => {
      await sql.query("delete from app_private.account_logins where account_id='second-user'");
      await sql.query(
        "update app_private.account_logins set account_id='second-user' where account_id='complete-user'",
      );
    }),
    (error) =>
      (error as { code?: string; message?: string }).code === "23514" &&
      Boolean((error as Error).message.includes("user_login_missing")),
  );
  const preserved = await pg.query(
    "select account_id,login from app_private.account_logins where account_id in ('complete-user','second-user') order by account_id",
  );
  assert.deepEqual(preserved.rows, [
    { account_id: "complete-user", login: "complete-user" },
    { account_id: "second-user", login: "second-user" },
  ]);

  await pg.query("select app_private.rename_account_login($1,'USER',$2,$3,$4)", [
    "complete-user",
    "complete-user",
    "renamed-user",
    4,
  ]);
  const renamed = await pg.query(
    "select login from app_private.account_logins where account_id='complete-user'",
  );
  assert.deepEqual(renamed.rows, [{ login: "renamed-user" }]);
});

test("Account projection uses one joined read and reports missing login as integrity failure", async () => {
  let queries = 0;
  const store = new PostgresUserStore({
    transaction: async (work: (sql: { query: (text: string) => Promise<unknown> }) => unknown) =>
      work({
        query: async (text: string) => {
          queries++;
          assert.match(text, /FROM user_namespace_projection/);
          return {
            rows: [
              {
                id: "member-1",
                status: "active",
                createdAt: 1,
                login: null,
                google_email: null,
              },
            ],
          };
        },
      }),
  } as never);

  await assert.rejects(
    store.view("member-1"),
    (error) =>
      error instanceof UserError &&
      error.status === 500 &&
      error.message === "User 登入名稱資料不完整。",
  );
  assert.equal(queries, 1);
});

test("registration retry reports missing login integrity instead of fabricating a repair", async () => {
  const statements: string[] = [];
  const store = new PostgresUserStore({
    transaction: async (work: (sql: { query: (text: string) => Promise<unknown> }) => unknown) =>
      work({
        query: async (text: string) => {
          statements.push(text);
          if (text.includes("FROM users m JOIN user_identities")) {
            return {
              rows: [{ id: "member-1", status: "active", createdAt: 1, auth_user_id: null }],
            };
          }
          return { rows: [] };
        },
      }),
  } as never);

  await assert.rejects(
    store.registerLine("line:test", `U${"1".repeat(32)}`, "alice", 10),
    (error) =>
      error instanceof UserError &&
      error.status === 500 &&
      error.message === "User 登入名稱資料不完整。",
  );
  assert.equal(
    statements.some((statement) => statement.includes("claim_account_login")),
    false,
  );
});

test("Account reads a resolved stable User ID and updates login independently from Profile", async () => {
  const calls: unknown[][] = [];
  const service = createUser(
    dependencies({
      find: async () => ({ id: "member-1", status: "active", createdAt: 1 }),
      publicById: async (userId) => (userId === "member-1" ? { id: userId, login: "alice" } : null),
      updateLogin: async (...args) => {
        calls.push(args);
        return { ...memberView, login: String(args[1]) };
      },
    }),
  );

  assert.deepEqual(await service.publicById("member-1"), { id: "member-1", login: "alice" });
  assert.deepEqual(await service.updateLogin("subject", " Alice-2 ", "alice"), {
    ...memberView,
    login: "alice-2",
  });
  assert.equal(calls[0]?.[0], "member-1");
  assert.equal(calls[0]?.[1], "alice-2");
  assert.equal(calls[0]?.[2], "alice");
});

test("login rename requires the observed login before reaching persistence", async () => {
  const service = createUser(dependencies({}));
  await assert.rejects(
    () => service.updateLogin("subject", "alice-2", undefined),
    (error) => error instanceof UserError && error.status === 400,
  );
});

test("login rename rejects stale edits and collisions without changing identity", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  const store = new PostgresUserStore(db);
  const user = await store.registerLine("line:test", `U${"3".repeat(32)}`, "alice", 1);
  await store.registerLine("line:test", `U${"4".repeat(32)}`, "bob", 1);
  const renamed = await store.updateLogin(user.id, "alice-2", "alice", 2);
  assert.equal(renamed.id, user.id);
  assert.equal(renamed.login, "alice-2");
  for (const [login, expectedLogin] of [
    ["alice-3", "alice"],
    ["bob", "alice-2"],
  ]) {
    await assert.rejects(
      store.updateLogin(user.id, login!, expectedLogin!, 3),
      (error) => error instanceof UserError && error.status === 409,
    );
  }
  assert.equal((await store.view(user.id))?.login, "alice-2");
});
