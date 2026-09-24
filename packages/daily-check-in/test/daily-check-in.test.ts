import assert from "node:assert/strict";
import { test } from "node:test";
import { UserError } from "@line-work/account/domain/user";
import { createDailyCheckIn, type DailyCheckInDependencies } from "../src/application.js";
import { DailyCheckInError } from "../src/domain.js";

const now = Date.parse("2026-09-06T23:59:59.999+08:00");
const member = { id: "member-1", status: "active" as const, createdAt: 1, googleEmail: null };
const coins = { balance: 1, day: "2026-09-06", claimedToday: true, dailyReward: 1 };

function dependencies(overrides: Partial<DailyCheckInDependencies> = {}): DailyCheckInDependencies {
  return {
    activeUser: async () => ({ id: member.id }),
    member: async () => member,
    repository: () => ({ claim: async () => 1 }),
    coinBalance: async () => 1,
    claimedToday: async () => true,
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
          return 1;
        },
      }),
      coinBalance: async (...args) => {
        calls.push(["balance", ...args]);
        return 1;
      },
      claimedToday: async (...args) => {
        calls.push(["claimedToday", ...args]);
        return true;
      },
      now: () => now + timeCalls++,
    }),
  );

  assert.equal(timeCalls, 0);
  assert.deepEqual(await app.checkIn("verified-subject"), {
    member: { ...member, coins },
    checkIn: { credited: 1, coins },
  });
  assert.equal(timeCalls, 1);
  assert.deepEqual(calls, [
    ["activeUser", "verified-subject"],
    ["claim", member.id, now],
    ["balance", member.id],
    ["claimedToday", member.id, "2026-09-06"],
    ["member", member.id],
  ]);
});

test("DailyCheckIn rejects failed active-user qualification before claim or projection", async () => {
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
        repository: () => ({ claim: forbidden }),
        coinBalance: forbidden,
        claimedToday: forbidden,
      }),
    );

    await assert.rejects(
      app.checkIn("subject"),
      (error) => error instanceof UserError && error.status === 403,
    );
    assert.equal(protectedCalls, 0);
  }
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
      }),
      coinBalance: async () => {
        queries++;
        return 1;
      },
      claimedToday: async () => {
        queries++;
        return false;
      },
    }),
  );

  await assert.rejects(app.checkIn("subject"), (error) => error === failure);
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
          if (credited) return 0;
          credited = true;
          return 1;
        },
      }),
      coinBalance: async () => {
        if (failRead) throw new Error("projection unavailable");
        return 1;
      },
    }),
  );

  await assert.rejects(app.checkIn("subject"), /projection unavailable/);
  failRead = false;
  assert.deepEqual(await app.checkIn("subject"), {
    member: { ...member, coins },
    checkIn: { credited: 0, coins },
  });
  assert.deepEqual(claims, [
    [member.id, now],
    [member.id, now],
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
      claimedToday: async () => {
        reads++;
        return true;
      },
    }),
  );

  await assert.rejects(app.coinView(member.id, Number.NaN), DailyCheckInError);
  assert.equal(reads, 0);
});
