import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isMenuPage,
  lineBotV1RichMenu,
  MENU_PAGES,
  menuAlias,
} from "../src/modules/assistant/rich-menu/definition";
import { attendanceOperationLabels } from "../src/modules/attendance/operation-labels";
import { entryDestination } from "../src/shared/presentation/entry-destination";
import { entryRoute, loginReturnUrl } from "../src/shared/presentation/entry-route";

test("only two attendance menus remain, with direct links and no unfinished feature targets", () => {
  assert.deepEqual(MENU_PAGES, ["attendance-in", "attendance-out"]);
  for (const retired of [
    "home",
    "team",
    "forms",
    "notifications",
    "incident",
    "team-out",
    "forms-out",
    "notifications-out",
    "incident-out",
  ]) {
    assert.equal(isMenuPage(retired), false);
  }
  const destinations = ["/repositories", "/partners", "/profile", "/notifications"];
  for (const page of MENU_PAGES) {
    assert.equal(menuAlias(page), `line_bot_v1-${page}`);
    const menu = lineBotV1RichMenu(
      "https://miniapp.line.me/123-test",
      { width: 1536, height: 1024 },
      page,
    );
    assert.equal(menu.areas.length, 5);
    assert.equal(menu.areas[0]!.action.label, page === "attendance-out" ? "下班" : "上班");
    assert.deepEqual(
      menu.areas.slice(1).map((a) => a.action.label),
      ["儲存庫", "團隊協作", "個人", "通知中心"],
    );
    for (const [index, area] of menu.areas.slice(1).entries()) {
      assert.equal(area.action.type, "uri");
      if (area.action.type === "uri") {
        assert.equal(entryDestination(area.action.uri), destinations[index]);
        assert.equal(entryDestination(loginReturnUrl(area.action.uri)), destinations[index]);
      }
    }
    for (const [index, { bounds: a, action }] of menu.areas.entries()) {
      assert.equal(action.type, "uri");
      assert.ok(
        a.x >= 0 &&
          a.y >= 0 &&
          a.width > 0 &&
          a.height > 0 &&
          a.x + a.width <= 1536 &&
          a.y + a.height <= 1024,
      );
      for (const { bounds: b } of menu.areas.slice(index + 1)) {
        assert.ok(
          !(
            a.x < b.x + b.width &&
            a.x + a.width > b.x &&
            a.y < b.y + b.height &&
            a.y + a.height > b.y
          ),
        );
      }
    }
  }
});
test("only explicit start/end survive LIFF and login; removed overtime and duplicate intents are rejected", () => {
  const found = new Set<string>();
  for (const page of ["attendance-in", "attendance-out"] as const) {
    const menu = lineBotV1RichMenu(
      "https://miniapp.line.me/123-test",
      { width: 1536, height: 1024 },
      page,
    );
    for (const { action } of menu.areas) {
      if (action.type !== "uri") continue;
      const url = new URL(action.uri),
        operation = url.searchParams.get("operation");
      if (!operation) continue;
      found.add(operation);
      assert.equal(entryRoute(url.href), "attendance");
      assert.equal(entryDestination(url.href), `/attendance/${operation}`);
      assert.ok(!loginReturnUrl(url.href + "&access_token=secret#secret").includes("secret"));
    }
  }
  assert.deepEqual([...found].sort(), Object.keys(attendanceOperationLabels).sort());
  for (const query of [
    "attendance=1&operation=early-overtime/start",
    "attendance=1&operation=delete",
    "attendance=1&operation=clock-in&operation=clock-out",
    "membership=1&operation=clock-in",
  ])
    assert.equal(entryRoute(`https://app.example/?${query}`), "invalid");
  for (const action of ["clockIn", "clockOut"])
    assert.equal(
      loginReturnUrl(`https://app.example/?${action}=1&access_token=secret#secret`),
      `https://app.example/?${action}=1`,
    );
});
