import assert from "node:assert/strict";
import { test } from "node:test";
import { isServerOnlyPackageSource } from "./check-architecture.mjs";

test("context adapters, composition, agents, testing and platform database mechanisms stay server-only unless browser-owned", () => {
  for (const source of [
    "packages/account/src/postgres/user-management.ts",
    "packages/assistant/src/adapters/gemini.ts",
    "packages/attendance/src/composition/bootstrap/postgres-attendance-store.ts",
    "packages/expense/src/agents/receipt.ts",
    "packages/platform/src/testing/postgres.ts",
    "packages/platform/src/database/postgres/database.ts",
    "packages/platform/src/migration/runtime.ts",
    "packages/line/src/adapters.ts",
    "packages/line/src/rich-menu/alias.ts",
    "packages/line/src/rich-menu/client.ts",
    "packages/line/src/rich-menu/image.ts",
    "packages/line/src/rich-menu/menu.ts",
    "packages/line/src/rich-menu/transport.ts",
    "packages/line/src/rich-menu/types.ts",
    "packages/line/src/rich-menu/user-link.ts",
  ]) {
    assert.equal(isServerOnlyPackageSource(source), true, source);
  }

  assert.equal(isServerOnlyPackageSource("packages/line/src/liff/index.ts"), false);
  assert.equal(isServerOnlyPackageSource("packages/line/src/liff/client.ts"), false);
  assert.equal(isServerOnlyPackageSource("packages/line/src/mini-app/registration.ts"), false);
  assert.equal(isServerOnlyPackageSource("packages/line/src/identity/index.ts"), true);
  assert.equal(isServerOnlyPackageSource("packages/line/src/messaging-api/index.ts"), true);
  assert.equal(isServerOnlyPackageSource("packages/line/src/rich-menu/index.ts"), true);
  assert.equal(isServerOnlyPackageSource("packages/account/src/domain/user.ts"), false);
});
