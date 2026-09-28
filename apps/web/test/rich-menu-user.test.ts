import assert from "node:assert/strict";
import { test } from "node:test";
import { SUBMENU_PAGES } from "../src/modules/assistant/rich-menu/definition";
import { syncUserRichMenu } from "../src/modules/assistant/rich-menu/user-menu.server";

function fixture(initial: string | null, name = "Line_Bot_v1-attendance-in") {
  let current = initial;
  const links: string[] = [];
  const aliases: string[] = [];
  const client = {
    getUserMenu: async () => current,
    get: async () => ({ name }),
    getAlias: async (alias: string) => {
      aliases.push(alias);
      return `${alias}-id`;
    },
    linkUser: async (_subject: string, id: string) => {
      current = id;
      links.push(id);
    },
  };
  return { client, links, aliases };
}

test("maintenance preserves every submenu and migrates its previous publication", async () => {
  for (const page of SUBMENU_PAGES) {
    for (const attendance of ["attendance-in", "attendance-out"] as const) {
      const active = fixture(`line_bot_v1-${page}-id`, `Line_Bot_v1-${page}`);
      await syncUserRichMenu(active.client, "member", attendance);
      assert.deepEqual(active.links, []);
      assert.deepEqual(active.aliases, [`line_bot_v1-${page}`]);
      const old = fixture("old-publication", `Line_Bot_v1-${page}`);
      await syncUserRichMenu(old.client, "member", attendance);
      assert.deepEqual(old.links, [`line_bot_v1-${page}-id`]);
    }
  }
});

test("explicit Back overrides submenu browsing using the authoritative attendance page", async () => {
  for (const page of SUBMENU_PAGES) {
    for (const attendance of ["attendance-in", "attendance-out"] as const) {
      const { client, links } = fixture(`line_bot_v1-${page}-id`, `Line_Bot_v1-${page}`);
      await syncUserRichMenu(client, "member", attendance, true);
      assert.deepEqual(links, [`line_bot_v1-${attendance}-id`]);
    }
  }
});

test("maintenance initializes missing bindings and corrects stale attendance menus", async () => {
  for (const current of [null, "old-attendance-id"]) {
    const { client, links } = fixture(current);
    await syncUserRichMenu(client, "member", "attendance-out");
    assert.deepEqual(links, ["line_bot_v1-attendance-out-id"]);
  }
});

test("navigation during alias resolution is retried without overwriting the new page", async () => {
  const { client, links } = fixture("old-attendance-id");
  let reads = 0;
  client.getUserMenu = async () => (++reads === 1 ? "old-attendance-id" : "forms-id");
  await assert.rejects(syncUserRichMenu(client, "member", "attendance-out"), /navigation_changed/);
  assert.deepEqual(links, []);
});

test("missing aliases and failed readback remain failures for durable retry", async () => {
  const { client, links } = fixture("old-attendance-id");
  await assert.rejects(
    syncUserRichMenu({ ...client, getAlias: async () => null }, "member", "attendance-out"),
    /not_configured/,
  );
  assert.deepEqual(links, []);
  await assert.rejects(
    syncUserRichMenu({ ...client, linkUser: async () => {} }, "member", "attendance-out"),
    /readback_mismatch/,
  );
});
