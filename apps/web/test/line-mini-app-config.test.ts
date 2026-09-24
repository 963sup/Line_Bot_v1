import assert from "node:assert/strict";
import test from "node:test";
import { CURRENT_LINE_MINI_APP_STAGE, lineMiniApp } from "../src/shared/server/line-mini-app";

test("MINI App stages derive LIFF and Login Channel identity from one permanent URL", () => {
  assert.deepEqual(lineMiniApp("developing"), {
    stage: "developing",
    url: "https://miniapp.line.me/2011594976-EwkCszKu",
    liffId: "2011594976-EwkCszKu",
    channelId: "2011594976",
  });
  assert.deepEqual(lineMiniApp("review"), {
    stage: "review",
    url: "https://miniapp.line.me/2011594977-fUpeBs2q",
    liffId: "2011594977-fUpeBs2q",
    channelId: "2011594977",
  });
  assert.deepEqual(lineMiniApp("published"), {
    stage: "published",
    url: "https://miniapp.line.me/2011594978-b2ktvto5",
    liffId: "2011594978-b2ktvto5",
    channelId: "2011594978",
  });
});

test("current MINI App stage is explicit and independent of deployment provider", () => {
  assert.equal(CURRENT_LINE_MINI_APP_STAGE, "developing");
  assert.deepEqual(lineMiniApp(), lineMiniApp("developing"));
});
