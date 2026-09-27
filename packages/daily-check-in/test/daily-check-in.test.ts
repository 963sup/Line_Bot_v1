import assert from "node:assert/strict";
import { test } from "node:test";
import { UserError } from "@line-work/account/domain/user";
import { createDailyCheckIn, type DailyCheckInDependencies } from "../src/application.js";
import { DAILY_CHECK_IN_POLICY, type DailyCheckInClaim, DailyCheckInError } from "../src/domain.js";

const now = Date.parse("2026-09-06T23:59:59.999+08:00");
const userId = "member-1";
const claim: DailyCheckInClaim = {
  day: "2026-09-06",
  prizeCode: "coin-one",
  reward: 1,
  policyVersion: "wheel-v1",
  decidedAt: now,
};

function dependencies(overrides: Partial<DailyCheckInDependencies> = {}): DailyCheckInDependencies {
  return {
    activeUser: async () => ({ id: userId }),
    repository: () => ({
      claim: async () => ({ claim, credited: 1, replayed: false }),
      read: async () => claim,
    }),
    now: () => now,
    ...overrides,
  };
}

test("DailyCheckIn command returns only its owner result and uses one trusted time", async () => {
  const calls: unknown[][] = [];
  let timeCalls = 0;
  const app = createDailyCheckIn(
    dependencies({
      activeUser: async (...args) => {
        calls.push(["activeUser", ...args]);
        return { id: userId };
      },
      repository: () => ({
        claim: async (...args) => {
          calls.push(["claim", ...args]);
          return { claim, credited: 1, replayed: false };
        },
        read: async (...args) => {
          calls.push(["read", ...args]);
          return claim;
        },
      }),
      now: () => now + timeCalls++,
    }),
  );

  assert.equal(timeCalls, 0);
  assert.deepEqual(await app.checkIn("verified-subject", "2026-09-06"), {
    claim,
    credited: 1,
    replayed: false,
  });
  assert.equal(timeCalls, 1);
  assert.deepEqual(calls, [
    ["activeUser", "verified-subject"],
    ["claim", userId, now, "2026-09-06"],
  ]);
});

test("DailyCheckIn rejects failed active-user qualification before day validation or mutation", async () => {
  for (const message of ["missing", "paused", "suspended"]) {
    let repositoryCalls = 0;
    const app = createDailyCheckIn(
      dependencies({
        activeUser: async () => {
          throw new UserError(403, message);
        },
        repository: () => ({
          claim: async () => {
            repositoryCalls++;
            throw new Error("unexpected claim");
          },
          read: async () => {
            repositoryCalls++;
            return null;
          },
        }),
      }),
    );

    await assert.rejects(
      app.checkIn("subject", "not-a-day"),
      (error) => error instanceof UserError && error.status === 403,
    );
    assert.equal(repositoryCalls, 0);
  }
});

test("DailyCheckIn rejects an invalid expected day before claim", async () => {
  let claims = 0;
  const app = createDailyCheckIn(
    dependencies({
      repository: () => ({
        claim: async () => {
          claims++;
          throw new Error("unexpected claim");
        },
        read: async () => null,
      }),
    }),
  );

  await assert.rejects(app.checkIn("subject", "2026-02-30"), DailyCheckInError);
  assert.equal(claims, 0);
});

test("DailyCheckIn claim failure is not hidden by a presentation projection", async () => {
  const failure = new Error("ledger unavailable");
  const app = createDailyCheckIn(
    dependencies({
      repository: () => ({
        claim: async () => {
          throw failure;
        },
        read: async () => {
          throw new Error("unexpected read");
        },
      }),
    }),
  );

  await assert.rejects(app.checkIn("subject", "2026-09-06"), (error) => error === failure);
});

test("DailyCheckIn current view owns day, claim and policy without Account or Wallet projection", async () => {
  const reads: unknown[][] = [];
  const app = createDailyCheckIn(
    dependencies({
      repository: () => ({
        claim: async () => ({ claim, credited: 1, replayed: false }),
        read: async (...args) => {
          reads.push(args);
          return claim;
        },
      }),
    }),
  );

  assert.deepEqual(await app.currentView(userId), {
    day: "2026-09-06",
    claimedToday: true,
    claim,
    policy: DAILY_CHECK_IN_POLICY,
  });
  assert.deepEqual(reads, [[userId, "2026-09-06", "any"]]);
});

test("DailyCheckIn current view validates trusted time before persistence reads", async () => {
  let reads = 0;
  const app = createDailyCheckIn(
    dependencies({
      now: () => Number.NaN,
      repository: () => ({
        claim: async () => ({ claim, credited: 1, replayed: false }),
        read: async () => {
          reads++;
          return claim;
        },
      }),
    }),
  );

  await assert.rejects(app.currentView(userId), DailyCheckInError);
  assert.equal(reads, 0);
});

test("DailyCheckIn recovery validates subject before reading a claim", async () => {
  const reads: unknown[][] = [];
  const app = createDailyCheckIn(
    dependencies({
      activeUser: async (...args) => {
        reads.push(["activeUser", ...args]);
        return { id: userId };
      },
      repository: () => ({
        claim: async () => ({ claim, credited: 1, replayed: false }),
        read: async (...args) => {
          reads.push(["read", ...args]);
          return claim;
        },
      }),
    }),
  );

  assert.deepEqual(await app.readClaim("subject", "2026-09-06"), claim);
  assert.deepEqual(reads, [
    ["activeUser", "subject"],
    ["read", userId, "2026-09-06", "active"],
  ]);
});
