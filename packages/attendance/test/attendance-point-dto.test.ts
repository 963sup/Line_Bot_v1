import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseAttendanceClockPreparation,
  parseAttendanceSnapshot,
} from "../src/contracts/dto/attendance-client.js";
import { parseAttendanceSupplementInbox } from "../src/contracts/dto/attendance-supplement.js";

const point = {
  id: "repo",
  repositoryId: "repo",
  name: "Operations",
  address: null,
  latitude: 25.0375,
  longitude: 121.5637,
  radius: 100,
  version: 2,
};

test("Attendance client accepts an addressless point and preserves legacy descriptions", () => {
  const snapshot = parseAttendanceSnapshot({
    attendance: { records: [], active: null, menuState: "ready", computedAt: 10 },
    version: 0,
    sites: [point, { ...point, address: "既有街道地址" }],
  });

  assert.equal(snapshot.sites[0]?.address, null);
  assert.equal(snapshot.sites[1]?.address, "既有街道地址");
});

test("Attendance clock preparation publishes canonical User identity without a memberId alias", () => {
  assert.equal(
    parseAttendanceClockPreparation({ userId: "user", working: false, version: 0, sites: [] })
      .userId,
    "user",
  );
  assert.throws(
    () =>
      parseAttendanceClockPreparation({
        memberId: "user",
        working: false,
        version: 0,
        sites: [],
      }),
    /出勤準備回應不完整/,
  );
});

test("Attendance supplement DTO accepts an addressless immutable site snapshot", () => {
  const inbox = parseAttendanceSupplementInbox({
    viewerId: "member",
    mine: [
      {
        id: "request",
        userId: "member",
        repositoryId: "repo",
        kind: "new-session",
        sessionId: null,
        startedAt: 100,
        endedAt: 200,
        site: point,
        reason: "補登原因",
        submittedAt: 300,
        status: "PENDING",
        version: 0,
        reviewerId: null,
        reviewedAt: null,
        reviewReason: null,
      },
    ],
    review: [],
  });

  assert.equal(inbox.mine[0]?.site.address, null);
});
