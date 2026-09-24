import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { MENU_PAGES } from "../src/modules/assistant/rich-menu/definition";
import { buildRichMenuDesiredState } from "../src/modules/assistant/rich-menu/desired-state.server";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

test("Rich Menu desired state is derived from canonical definitions and assets", () => {
  const desired = buildRichMenuDesiredState(MENU_PAGES, repositoryRoot);
  assert.equal(desired.length, MENU_PAGES.length);
  assert.deepEqual(
    desired.map(({ page }) => page),
    [...MENU_PAGES],
  );
  assert.equal(
    desired.find(({ page }) => page === "home")?.image,
    "assets/line/rich-menu/work-assistant-attendance-in.png",
  );
  assert.equal(
    desired.find(({ page }) => page === "team-out")?.image,
    "assets/line/rich-menu/work-assistant-team.png",
  );
  for (const item of desired) {
    assert.ok(item.upload.length > 0, item.page);
    assert.ok(item.menu.size.width > 0, item.page);
    assert.ok(item.menu.size.height > 0, item.page);
  }
});
