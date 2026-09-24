import assert from "node:assert/strict";
import { test } from "node:test";
import { UserError } from "@line-work/account/domain/user";
import { createDailyCheckIn, type DailyCheckInDependencies } from "../src/application.js";
import { DAILY_CHECK_IN_POLICY, type DailyCheckInClaim, DailyCheckInError } from "../src/domain.js";

const now = Date.parse("2026-09-06T23:59:59.999+08:00");
const member = { id: "member-1", status: "active" as const, createdAt: 1, googleEmail: null };
const claim: DailyCheckInClaim = {
  day: "2026-09-06",
  prizeCode: "coin-one",
  reward: 1,
  policyVersion: "wheel-v1",
  decidedAt: now,
};
const coins = {
  balance: 1,
  day: "2026-09-06",
  claimedToday: true,
  claim,
  policy: DAILY_CHECK_IN_POLICY,
};

function dependencies(overrides: Partial<DailyCheckInDependencies> = {}): DailyCheckInDependencies {
  return {
    activeUser: async () => ({ id: member.id }),
    member: async () => member,
    repository: () => ({
      claim: async () => ({ claim, credited: 1, replayed: false }),
      read: async () => claim,
    }),
    coinBalance: async () => 1,
    now: () => now,
    ...overrides,
  };
}

test("DailyCheckIn preserves the complete wire result and one trusted time across Taipei midnight", async () => {
  const calls: unknown[][] = [];
  let timeCalls = 0;
  const app = createDailyCheckIn(
    dependencies({
      activeUser: async (...args) => {
        calls.push(["activeUser", ...args]);
        return { id: member.id };
      },
      member: async (...args) => {
        calls.push(["member", ...args]);
        return member;
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
      coinBalance: async (...args) => {
        calls.push(["balance", ...args]);
        return 1;
      },
      now: () => now + timeCalls++,
    }),
  );

  assert.equal(timeCalls, 0);
  assert.deepEqual(await app.checkIn("verified-subject", "2026-09-06"), {
    member: { ...member, coins },
    checkIn: { claim, credited: 1, replayed: false, coins },
  });
  assert.equal(timeCalls, 1);
  assert.deepEqual(calls, [
    ["activeUser", "verified-subject"],
    ["claim", member.id, now, "2026-09-06"],
    ["balance", member.id],
    ["read", member.id, "2026-09-06", "any"],
    ["member", member.id],
  ]);
});

test("DailyCheckIn rejects failed active-user qualification before day validation or projection", async () => {
  for (const message of ["missing", "paused", "suspended"]) {
    let protectedCalls = 0;
    const forbidden = async (): Promise<never> => {
      protectedCalls++;
      throw new Error("unexpected protected call");
    };
    const app = createDailyCheckIn(
      dependencies({
        activeUser: async () => {
          throw new UserError(403, message);
        },
        member: forbidden,
        repository: () => ({ claim: forbidden, read: forbidden }),
        coinBalance: forbidden,
      }),
    );

    await assert.rejects(
      app.checkIn("subject", "not-a-day"),
      (error) => error instanceof UserError && error.status === 403,
    );
    assert.equal(protectedCalls, 0);
  }
});

test("DailyCheckIn rejects invalid expected day before claim or projection", async () => {
  let protectedCalls = 0;
  const forbidden = async (): Promise<never> => {
    protectedCalls++;
    throw new Error("unexpected protected call");
  };
  const app = createDailyCheckIn(
    dependencies({
      repository: () => ({ claim: forbidden, read: forbidden }),
      coinBalance: forbidden,
      member: forbidden,
    }),
  );

  await assert.rejects(app.checkIn("subject", "2026-02-30"), DailyCheckInError);
  assert.equal(protectedCalls, 0);
});

test("DailyCheckIn propagates claim failure without reading a success projection", async () => {
  let queries = 0;
  const failure = new Error("ledger unavailable");
  const app = createDailyCheckIn(
    dependencies({
      repository: () => ({
        claim: async () => {
          throw failure;
        },
        read: async () => {
          queries++;
          return null;
        },
      }),
      coinBalance: async () => {
        queries++;
        return 1;
      },
    }),
  );

  await assert.rejects(app.checkIn("subject", "2026-09-06"), (error) => error === failure);
  assert.equal(queries, 0);
});

test("DailyCheckIn query failure after commit remains failure; retry uses the same origin day", async () => {
  let credited = false;
  let failRead = true;
  const claims: unknown[][] = [];
  const app = createDailyCheckIn(
    dependencies({
      repository: () => ({
        claim: async (...args) => {
          claims.push(args);
          if (credited) return { claim, credited: 0, replayed: true };
          credited = true;
          return { claim, credited: 1, replayed: false };
        },
        read: async () => claim,
      }),
      coinBalance: async () => {
        if (failRead) throw new Error("projection unavailable");
        return 1;
      },
    }),
  );

  await assert.rejects(app.checkIn("subject", "2026-09-06"), /projection unavailable/);
  failRead = false;
  assert.deepEqual(await app.checkIn("subject", "2026-09-06"), {
    member: { ...member, coins },
    checkIn: { claim, credited: 0, replayed: true, coins },
  });
  assert.deepEqual(claims, [
    [member.id, now, "2026-09-06"],
    [member.id, now, "2026-09-06"],
  ]);
});

test("DailyCheckIn coin query validates time before calling projection ports", async () => {
  let reads = 0;
  const app = createDailyCheckIn(
    dependencies({
      coinBalance: async () => {
        reads++;
        return 1;
      },
      repository: () => ({
        claim: async () => ({ claim, credited: 1, replayed: false }),
        read: async () => {
          reads++;
          return claim;
        },
      }),
    }),
  );

  await assert.rejects(app.coinView(member.id, Number.NaN), DailyCheckInError);
  assert.equal(reads, 0);
});

test("DailyCheckIn recovery validates subject before reading a claim", async () => {
  const reads: unknown[][] = [];
  const app = createDailyCheckIn(
    dependencies({
      activeUser: async (...args) => {
        reads.push(["activeUser", ...args]);
        return { id: member.id };
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
    ["read", member.id, "2026-09-06", "active"],
  ]);
});
