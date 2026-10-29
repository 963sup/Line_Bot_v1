import assert from "node:assert/strict";
import { test } from "node:test";
import { readPartnersView } from "../src/contracts/parse-view.js";

test("Partners decoder retains actor and optional paging/review fields without inventing them", () => {
  const view = { userId: "actor", partners: [], news: [], referrals: [] };
  assert.deepEqual(readPartnersView(view), view);
  assert.deepEqual(readPartnersView({ ...view, canReview: false, next: null }), {
    ...view,
    canReview: false,
    next: null,
  });
  assert.throws(() => readPartnersView({ ...view, userId: undefined }));
  assert.throws(() => readPartnersView({ ...view, next: false }));
});
