import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MENU_PAGES,
  menuAlias,
  workAssistantRichMenu,
} from "../src/modules/assistant/rich-menu/definition";
import { attendanceOperationLabels } from "../src/modules/attendance/operation-labels";
import { entryDestination } from "../src/shared/presentation/entry-destination";
import { entryRoute, loginReturnUrl } from "../src/shared/presentation/entry-route";

test("native menu states retain geometry and return each submenu to its source state", () => {
  for (const page of MENU_PAGES) {
    assert.equal(menuAlias(page), `work-assistant-${page}`);
    assert.ok(menuAlias(page).length <= 32, "LINE aliases cannot exceed 32 characters");
    const menu = workAssistantRichMenu(
      "https://miniapp.line.me/123-test",
      { width: 1536, height: 1024 },
      page,
    );
    assert.equal(menu.areas.length, page === "home" || page.startsWith("attendance-") ? 7 : 4);
    for (const [i, { bounds: a, action }] of menu.areas.entries()) {
      assert.ok(
        a.x >= 0 &&
          a.y >= 0 &&
          a.width > 0 &&
          a.height > 0 &&
          a.x + a.width <= 1536 &&
          a.y + a.height <= 1024,
      );
      for (const { bounds: b } of menu.areas.slice(i + 1))
        assert.ok(
          !(
            a.x < b.x + b.width &&
            a.x + a.width > b.x &&
            a.y < b.y + b.height &&
            a.y + a.height > b.y
          ),
        );
      assert.notEqual(action.type, "postback");
      if (action.type === "richmenuswitch")
        assert.ok(MENU_PAGES.some((p) => menuAlias(p) === action.richMenuAliasId));
    }
  }
  const start = workAssistantRichMenu(
    "https://miniapp.line.me/123-test",
    { width: 1536, height: 1024 },
    "attendance-in",
  );
  const end = workAssistantRichMenu(
    "https://miniapp.line.me/123-test",
    { width: 1536, height: 1024 },
    "attendance-out",
  );
  assert.deepEqual(
    start.areas.map((a) => a.bounds),
    end.areas.map((a) => a.bounds),
  );
  assert.equal(start.areas[0]!.action.label, "上班");
  assert.equal(end.areas[0]!.action.label, "下班");
  const home = workAssistantRichMenu("https://miniapp.line.me/123-test", {
    width: 1536,
    height: 1024,
  });
  assert.deepEqual(home.areas, start.areas);
  for (const menu of [home, start, end]) {
    const center = menu.areas.find(
      ({ bounds: b }) => b.x <= 768 && b.x + b.width > 768 && b.y <= 512 && b.y + b.height > 512,
    )!;
    assert.equal(center.action.type, "uri");
    const membership = menu.areas.find((a) => a.action.label === "設定")!.action;
    assert.equal(membership.type, "uri");
    if (membership.type === "uri") {
      assert.equal(membership.uri, "https://miniapp.line.me/123-test?membership=1");
      assert.equal(entryDestination(membership.uri), "/settings");
    }
    const repositories = menu.areas.find((a) => a.action.label === "Repository")!.action;
    assert.equal(repositories.type, "uri");
    if (repositories.type === "uri") {
      assert.equal(repositories.uri, "https://miniapp.line.me/123-test?repositories=1");
      assert.equal(entryDestination(repositories.uri), "/repositories");
    }
    assert.deepEqual(
      menu.areas.slice(1).map((a) => a.action.label),
      ["Repository", "異常通報", "表單作業", "團隊協作", "設定", "通知中心"],
    );
  }
  for (const page of ["team", "forms", "notifications", "incident"] as const) {
    for (const state of ["home", "attendance-in", "attendance-out"] as const) {
      const menu = workAssistantRichMenu(
        "https://miniapp.line.me/123-test",
        { width: 1536, height: 1024 },
        state,
      );
      const target = state === "attendance-out" ? (`${page}-out` as const) : page;
      const action = menu.areas.find(
        (area) =>
          area.action.type === "richmenuswitch" &&
          area.action.richMenuAliasId === menuAlias(target),
      )?.action;
      assert.equal(action?.type, "richmenuswitch");
    }
    const base = workAssistantRichMenu(
      "https://miniapp.line.me/123-test",
      { width: 1536, height: 1024 },
      page,
    );
    const out = workAssistantRichMenu(
      "https://miniapp.line.me/123-test",
      { width: 1536, height: 1024 },
      `${page}-out`,
    );
    assert.deepEqual(base.areas.slice(1), out.areas.slice(1));
    assert.deepEqual(base.areas[0]!.action, {
      type: "richmenuswitch",
      label: "返回主選單",
      richMenuAliasId: menuAlias("attendance-in"),
      data: "menu=attendance-in",
    });
    assert.deepEqual(out.areas[0]!.action, {
      type: "richmenuswitch",
      label: "返回主選單",
      richMenuAliasId: menuAlias("attendance-out"),
      data: "menu=attendance-out",
    });
  }
});
test("expense and leave entries open their published Google Forms directly", () => {
  const menu = workAssistantRichMenu(
    "https://miniapp.line.me/123-test",
    { width: 1536, height: 1024 },
    "forms",
  );
  assert.deepEqual(
    menu.areas.slice(2).map(({ action }) => action),
    [
      { type: "uri", label: "費用申請", uri: "https://forms.gle/AySvenv4ELkFwB1z9" },
      { type: "uri", label: "請假申請", uri: "https://forms.gle/E88kHQgRFcQ6YKyW6" },
    ],
  );
});
test("only explicit start/end survive LIFF and login; removed overtime and duplicate intents are rejected", () => {
  const found = new Set<string>();
  for (const page of ["attendance-in", "attendance-out"] as const) {
    const menu = workAssistantRichMenu(
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
