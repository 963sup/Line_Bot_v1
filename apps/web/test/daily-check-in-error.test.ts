import assert from "node:assert/strict";
import test from "node:test";
import { UserError } from "@line-work/account/domain/user";
import { DailyCheckInError } from "@line-work/daily-check-in/domain";
import { apiError } from "../src/modules/account/http.server";

test("DailyCheckIn keeps the existing HTTP invalid-request contract", async () => {
  const response = apiError(new DailyCheckInError());
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "會員簽到時間不正確。",
    code: "invalid_request",
    retryable: false,
  });
});

test("account qualification failures retain their own HTTP contract", async () => {
  const response = apiError(new UserError(403, "會員已停權。"));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "membership_denied");
});

test("untrusted error-shaped objects do not become public business failures", async () => {
  const response = apiError({ status: 400, message: "private upstream detail" });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, "service_unavailable");
  assert.equal(body.retryable, true);
  assert.notEqual(body.error, "private upstream detail");
});
