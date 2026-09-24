import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorkplaceChat } from "../src/application/workplace-chat.js";
import { transitionWorkplaceChat } from "../src/domain.js";

test("chat boundaries: expiry, stale buttons, old locations and explicit confirmation", () => {
  const draft = transitionWorkplaceChat(null, { type: "start", name: "Office" }, 1000, 1000, "id")
    .draft!;
  assert.equal(
    transitionWorkplaceChat(draft, { type: "start", name: "Other" }, 1001, 1001, "other").draft!.id,
    "id",
  );
  assert.equal(
    transitionWorkplaceChat(
      draft,
      { type: "location", latitude: 25, longitude: 121, address: "" },
      1001,
      999,
      "id",
    ).draft!.phase,
    "location",
  );
  assert.equal(
    transitionWorkplaceChat(
      draft,
      { type: "location", latitude: 91, longitude: 121, address: "" },
      1001,
      1001,
      "id",
    ).draft!.phase,
    "location",
  );
  assert.equal(
    transitionWorkplaceChat(draft, { type: "cancel", token: "other:1" }, 1001, 1001, "id").draft!
      .phase,
    "location",
  );
  assert.equal(
    transitionWorkplaceChat(draft, { type: "confirm", token: "id:1" }, 1001, 1001, "id").command,
    undefined,
  );
  assert.equal(
    transitionWorkplaceChat(draft, { type: "status" }, draft.expiresAt, draft.expiresAt, "id")
      .draft,
    null,
  );
  assert.equal(
    transitionWorkplaceChat(draft, { type: "cancel", token: "id:1" }, 1001, 1001, "id").draft!
      .phase,
    "cancelled",
  );
  const located = transitionWorkplaceChat(
    draft,
    { type: "location", latitude: 0, longitude: 0, address: "" },
    1001,
    1001,
    "id",
  ).draft!;
  for (const radius of [0, -1, 1.5, 10001, NaN])
    assert.equal(
      transitionWorkplaceChat(located, { type: "radius", radius }, 1002, 1002, "id").draft!.phase,
      "radius",
    );
  const reselected = transitionWorkplaceChat(
    located,
    { type: "reselect", token: "id:2" },
    1002,
    1002,
    "id",
  ).draft!;
  assert.equal(reselected.latitude, undefined);
});

test("application maps trusted subject to member and rejects before store access", async () => {
  let called = false;
  const chat = createWorkplaceChat({
    activeUser: async () => {
      throw Error("inactive");
    },
    store: () => {
      called = true;
      throw Error("unexpected");
    },
    now: () => 1,
    uuid: () => "id",
  });
  await assert.rejects(chat("subject", "event", 1, { type: "status" }), /inactive/);
  assert.equal(called, false);
});
