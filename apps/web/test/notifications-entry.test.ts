import assert from "node:assert/strict";
import { test } from "node:test";
import { entryDestination } from "../src/shared/presentation/entry-destination";
import { loginReturnUrl } from "../src/shared/presentation/entry-route";

test("notification continuation preserves only notification view state", () => {
  assert.equal(
    loginReturnUrl("https://example.test/notifications?notificationView=unread&token=secret"),
    "https://example.test/notifications?notificationView=unread",
  );
  assert.equal(
    entryDestination("https://example.test/?notifications=1&notificationView=unread"),
    "/notifications?notificationView=unread",
  );
  assert.equal(
    entryDestination("https://example.test/?notifications=1&notificationView=unknown"),
    "/notifications",
  );
});
