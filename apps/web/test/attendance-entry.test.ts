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

test("six menus expose four native switches and only Back on each submenu", () => {
  assert.deepEqual(MENU_PAGES, [
    "attendance-in",
    "attendance-out",
    "forms",
    "incident",
    "notifications",
    "team",
  ]);
  for (const retired of ["home", "team-out", "forms-out", "notifications-out", "incident-out"]) {
    assert.equal(isMenuPage(retired), false);
  }
  for (const page of MENU_PAGES) {
    const menu = lineBotV1RichMenu(
      "https://miniapp.line.me/123-test",
      { width: 1536, height: 1024 },
      page,
    );
    if (page === "attendance-in" || page === "attendance-out") {
      assert.equal(menu.areas.length, 7);
      const links = menu.areas.filter((area) => area.action.type === "uri");
      assert.equal(links[0]!.action.label, page === "attendance-out" ? "下班" : "上班");
      const destinations = [
        page === "attendance-out" ? "/attendance/clock-out" : "/attendance/clock-in",
        "/repositories",
        "/profile",
      ];
      for (const [index, { action }] of links.entries()) {
        if (action.type !== "uri") throw new Error("Expected URI");
        assert.equal(entryDestination(action.uri), destinations[index]);
        assert.equal(entryDestination(loginReturnUrl(action.uri)), destinations[index]);
      }
      const switches = menu.areas.filter((area) => area.action.type === "richmenuswitch");
      assert.deepEqual(
        switches.map(({ action }) => action.type === "richmenuswitch" && action.richMenuAliasId),
        [
          "line_bot_v1-forms",
          "line_bot_v1-incident",
          "line_bot_v1-notifications",
          "line_bot_v1-team",
        ],
      );
      for (const { action } of switches) {
        if (action.type !== "richmenuswitch") throw new Error("Expected switch");
        assert.notEqual(action.data, "attendance-menu");
        assert.ok(MENU_PAGES.some((target) => menuAlias(target) === action.richMenuAliasId));
      }
    } else {
      assert.equal(menu.areas.length, 1, "Unimplemented submenu buttons must stay inactive");
      assert.deepEqual(menu.areas[0]!.action, {
        type: "postback",
        label: "返回出勤選單",
        data: "attendance-menu",
      });
      const back = menu.areas[0]!.bounds;
      assert.ok(
        back.x <= 160 && back.x + back.width >= 160 && back.y <= 110 && back.y + back.height >= 110,
      );
    }
    for (const [index, { bounds: a }] of menu.areas.entries()) {
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
