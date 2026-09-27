import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresFixture } from "@line-work/platform/testing/postgres";
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

test("Account owns login lookup and update independently from Profile", async () => {
  const calls: unknown[][] = [];
  const service = createUser(
    dependencies({
      find: async () => ({ id: "member-1", status: "active", createdAt: 1 }),
      publicByLogin: async (login) => (login === "alice" ? { id: "member-1", login } : null),
      updateLogin: async (...args) => {
        calls.push(args);
        return { ...memberView, login: String(args[1]) };
      },
    }),
  );

  assert.deepEqual(await service.publicByLogin(" Alice "), { id: "member-1", login: "alice" });
  assert.deepEqual(await service.updateLogin("subject", " Alice-2 "), {
    ...memberView,
    login: "alice-2",
  });
  assert.equal(calls[0]?.[0], "member-1");
  assert.equal(calls[0]?.[1], "alice-2");
});
