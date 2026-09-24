import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  createLineClient,
  parseLineWebhook,
  verifyLineSignature,
} from "../src/adapters/messaging/index.js";

test("LINE signature covers the original bytes, including whitespace and Unicode", () => {
  const secret = "offline-test-secret";
  const raw = Buffer.from('{ "events": [], "text": "測試" }\n');
  const signature = createHmac("sha256", secret).update(raw).digest("base64");
  assert.equal(verifyLineSignature(raw, signature, secret), true);
  const normalized = Buffer.from(JSON.stringify(JSON.parse(raw.toString("utf8"))));
  assert.equal(verifyLineSignature(normalized, signature, secret), false);
  assert.equal(verifyLineSignature(raw, signature, "wrong-secret"), false);
  assert.equal(verifyLineSignature(raw, null, secret), false);
  assert.equal(verifyLineSignature(raw, "invalid", secret), false);
});

test("unconfigured LINE adapters fail locally without exposing credentials", () => {
  assert.throws(() => createLineClient({ channelAccessToken: " " }), /LINE_CHANNEL_ACCESS_TOKEN/);
  assert.throws(() => verifyLineSignature(Buffer.from("{}"), null, ""), /LINE_CHANNEL_SECRET/);
});

test("LINE webhook parser preserves signed receiving-bot provider context", () => {
  const destination = `U${"2".repeat(32)}`;
  assert.deepEqual(parseLineWebhook(Buffer.from(JSON.stringify({ destination, events: [] }))), {
    destination,
    events: [],
  });
  assert.equal(parseLineWebhook(Buffer.from(JSON.stringify({ events: [] }))), null);
  assert.equal(
    parseLineWebhook(Buffer.from(JSON.stringify({ destination: "invalid", events: [] }))),
    null,
  );
});
