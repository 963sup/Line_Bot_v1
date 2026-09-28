import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { MENU_PAGES } from "../src/modules/assistant/rich-menu/definition";
import { buildRichMenuDesiredState } from "../src/modules/assistant/rich-menu/desired-state.server";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

test("Rich Menu desired state is derived from canonical definitions and assets", () => {
  const desired = buildRichMenuDesiredState(MENU_PAGES, repositoryRoot);
  assert.equal(desired.length, 6);
  assert.deepEqual(
    desired.map(({ page }) => page),
    [...MENU_PAGES],
  );
  assert.equal(
    desired.find(({ page }) => page === "attendance-in")?.image,
    "assets/line/rich-menu/line_bot_v1-attendance-in.png",
  );
  assert.equal(
    desired.find(({ page }) => page === "attendance-out")?.image,
    "assets/line/rich-menu/line_bot_v1-attendance-out.png",
  );
  for (const item of desired) {
    assert.ok(item.upload.length > 0 && item.upload.length <= 400000, item.page);
    assert.deepEqual(item.menu.size, { width: 1536, height: 1024 }, item.page);
  }
});
