import assert from "node:assert/strict";
import test from "node:test";
import { MENU_PAGES, SUBMENU_PAGES } from "../src/modules/assistant/rich-menu/definition";
import {
  activateRichMenuBatch,
  createRichMenuBatch,
  publishRichMenuBatch,
  type RichMenuPublicationConfig,
} from "../src/modules/assistant/rich-menu/publication.server";

type PublicationClient = Parameters<typeof createRichMenuBatch>[0];

function publicationClient(overrides: Partial<PublicationClient>): PublicationClient {
  return {
    validate: async () => new Response(null, { status: 200 }),
    create: async () => ({ richMenuId: "richmenu-default" }),
    upload: async () => new Response(null, { status: 200 }),
    get: async () => ({}),
    delete: async () => new Response(null, { status: 200 }),
    getAlias: async () => null,
    createAlias: async () => {},
    updateAlias: async () => {},
    deleteAlias: async () => {},
    getUserMenu: async () => null,
    getDefault: async () => null,
    activate: async () => new Response(null, { status: 200 }),
    deleteDefault: async () => new Response(null, { status: 200 }),
    linkUser: async () => {},
    ...overrides,
  };
}

const legacyAliasPrefix = ["work", "assistant"].join("-");
const legacyHomeAlias = `${legacyAliasPrefix}-home`;
const legacyTasksAlias = `${legacyAliasPrefix}-tasks`;

const config = (page: RichMenuPublicationConfig["page"]): RichMenuPublicationConfig => ({
  page,
  image: `assets/${page}.jpg`,
  upload: new Uint8Array([1, 2, 3]),
  menu: {
    size: { width: 800, height: 250 },
    selected: true,
    name: `menu-${page}`,
    chatBarText: page,
    areas: [],
  },
});

test("all six aliases survive publication and submenu targets activate before main entries", async () => {
  const configs = MENU_PAGES.map(config);
  const created = configs.map(({ page }) => ({ page, richMenuId: `new-${page}` }));
  const aliases = new Map<string, string>(
    MENU_PAGES.map((page) => [`line_bot_v1-${page}`, `old-${page}`]),
  );
  const updates: string[] = [];
  let defaultId: string | null = "old-attendance-in";
  const client = publicationClient({
    get: async (id: string) => {
      const found = configs.find(({ page }) => id === `new-${page}`);
      assert.ok(found);
      return found.menu;
    },
    getAlias: async (alias: string) => aliases.get(alias) ?? null,
    updateAlias: async (alias: string, id: string) => {
      aliases.set(alias, id);
      updates.push(alias);
    },
    deleteAlias: async (alias: string) => {
      aliases.delete(alias);
    },
    getDefault: async () => defaultId,
    activate: async (id: string) => {
      defaultId = id;
      return new Response(null, { status: 200 });
    },
  });
  await activateRichMenuBatch(client, configs, created);
  for (const page of MENU_PAGES) assert.equal(aliases.get(`line_bot_v1-${page}`), `new-${page}`);
  assert.deepEqual(
    updates.slice(0, 4),
    SUBMENU_PAGES.map((page) => `line_bot_v1-${page}`),
  );
  assert.equal(defaultId, "new-attendance-in");
});

test("create batch removes every known menu created in a failed operation", async () => {
  const configs = [config("attendance-in"), config("attendance-out")];
  const [firstConfig] = configs;
  assert.ok(firstConfig);
  const deleted: string[] = [];
  let creates = 0;
  const client = publicationClient({
    validate: async () => new Response(null, { status: 200 }),
    create: async () => ({ richMenuId: `richmenu-0000000${++creates}` }),
    upload: async (id: string) => {
      if (id.endsWith("2")) throw new Error("synthetic upload failure");
      return new Response(null, { status: 200 });
    },
    get: async () => firstConfig.menu,
    delete: async (id: string) => {
      deleted.push(id);
      return new Response(null, { status: 200 });
    },
  });

  await assert.rejects(createRichMenuBatch(client, configs), /newly created menus were removed/);
  assert.deepEqual(deleted, ["richmenu-00000002", "richmenu-00000001"]);
});

test("activation failure restores default and aliases while retaining new menus", async () => {
  const home = config("attendance-in");
  const newId = "richmenu-new0abcd";
  const oldId = "richmenu-old0abcd";
  const legacyId = "richmenu-legacyabcd";
  const aliases = new Map<string, string>([
    [legacyHomeAlias, oldId],
    [legacyTasksAlias, legacyId],
  ]);
  let defaultId: string | null = oldId;
  let failDeprecatedDelete = true;
  const deletedMenus: string[] = [];
  const client = publicationClient({
    get: async () => home.menu,
    getAlias: async (alias: string) => aliases.get(alias) ?? null,
    createAlias: async (alias: string, id: string) => {
      aliases.set(alias, id);
    },
    updateAlias: async (alias: string, id: string) => {
      aliases.set(alias, id);
    },
    deleteAlias: async (alias: string) => {
      if (alias === legacyTasksAlias && failDeprecatedDelete) {
        failDeprecatedDelete = false;
        throw new Error("synthetic alias failure");
      }
      aliases.delete(alias);
    },
    getDefault: async () => defaultId,
    activate: async (id: string) => {
      defaultId = id;
      return new Response(null, { status: 200 });
    },
    deleteDefault: async () => {
      defaultId = null;
      return new Response(null, { status: 200 });
    },
    delete: async (id: string) => {
      deletedMenus.push(id);
      return new Response(null, { status: 200 });
    },
  });

  await assert.rejects(
    activateRichMenuBatch(client, [home], [{ page: "attendance-in", richMenuId: newId }]),
    /previous remote state was restored; retained new menus/,
  );

  assert.equal(defaultId, oldId);
  assert.equal(aliases.get("line_bot_v1-attendance-in"), undefined);
  assert.equal(aliases.get(legacyHomeAlias), oldId);
  assert.equal(aliases.get(legacyTasksAlias), legacyId);
  assert.deepEqual(deletedMenus, []);
});

for (const previousAliasId of [null, "richmenu-old0abcd"] as const) {
  for (const failure of ["response-loss", "readback-failure"] as const) {
    test(`first alias ${previousAliasId ? "update" : "create"} ${failure} reconciles without deleting referenced menus`, async () => {
      const home = config("attendance-in");
      const newId = "richmenu-new0abcd";
      const alias = "line_bot_v1-attendance-in";
      const aliases = new Map<string, string>();
      if (previousAliasId) aliases.set(alias, previousAliasId);
      let targetReads = 0;
      let faultInjected = false;
      const deletedMenus: string[] = [];

      const writeAlias = async (name: string, id: string) => {
        aliases.set(name, id); // Provider commits before the response is lost.
        if (name === alias && id === newId && failure === "response-loss" && !faultInjected) {
          faultInjected = true;
          throw new Error("synthetic response loss after provider mutation");
        }
      };
      const client = publicationClient({
        get: async () => home.menu,
        getAlias: async (name: string) => {
          if (name === alias) {
            targetReads++;
            if (failure === "readback-failure" && targetReads === 3) {
              faultInjected = true;
              throw new Error("synthetic post-mutation readback failure");
            }
          }
          return aliases.get(name) ?? null;
        },
        createAlias: writeAlias,
        updateAlias: writeAlias,
        deleteAlias: async (name: string) => {
          aliases.delete(name);
        },
        getDefault: async () => "richmenu-existing-default",
        delete: async (id: string) => {
          deletedMenus.push(id);
          return new Response(null, { status: 200 });
        },
      });

      await assert.rejects(
        activateRichMenuBatch(client, [home], [{ page: "attendance-in", richMenuId: newId }]),
        /previous remote state was restored; retained new menus for reconciliation/,
      );
      assert.equal(faultInjected, true);
      assert.equal(aliases.get(alias) ?? null, previousAliasId);
      assert.deepEqual(deletedMenus, []);
    });
  }
}

test("failed rollback of an uncertain alias write retains new menus for reconciliation", async () => {
  const home = config("attendance-in");
  const alias = "line_bot_v1-attendance-in";
  const newId = "richmenu-new0abcd";
  const previousId = "richmenu-old0abcd";
  const aliases = new Map([[alias, previousId]]);
  const deletedMenus: string[] = [];
  const client = publicationClient({
    get: async () => home.menu,
    getAlias: async (name: string) => aliases.get(name) ?? null,
    updateAlias: async (name: string, id: string) => {
      if (id === previousId) throw new Error("synthetic restore unavailable");
      aliases.set(name, id);
      throw new Error("synthetic response loss after provider mutation");
    },
    getDefault: async () => previousId,
    delete: async (id: string) => {
      deletedMenus.push(id);
      return new Response(null, { status: 200 });
    },
  });

  await assert.rejects(
    activateRichMenuBatch(client, [home], [{ page: "attendance-in", richMenuId: newId }]),
    /rollback incomplete \(alias:line_bot_v1-attendance-in\); retained new menus for reconciliation/,
  );
  assert.equal(aliases.get(alias), newId);
  assert.deepEqual(deletedMenus, []);
});

test("alias read failure before any provider write safely cleans up newly created menus", async () => {
  const home = config("attendance-in");
  const newId = "richmenu-new0abcd";
  const alias = "line_bot_v1-attendance-in";
  let targetReads = 0;
  const deletedMenus: string[] = [];
  const client = publicationClient({
    get: async () => home.menu,
    getAlias: async (name: string) => {
      if (name === alias && ++targetReads === 2) throw new Error("synthetic pre-mutation failure");
      return null;
    },
    getDefault: async () => null,
    delete: async (id: string) => {
      deletedMenus.push(id);
      return new Response(null, { status: 200 });
    },
  });

  await assert.rejects(
    activateRichMenuBatch(client, [home], [{ page: "attendance-in", richMenuId: newId }]),
    /failed before remote publication; newly created menus were removed/,
  );
  assert.deepEqual(deletedMenus, [newId]);
});

test("later alias lost response restores earlier aliases without deleting new menus", async () => {
  const main = config("attendance-in");
  const submenu = config("forms");
  const created: Array<{ page: RichMenuPublicationConfig["page"]; richMenuId: string }> = [
    { page: submenu.page, richMenuId: "richmenu-new-forms" },
    { page: main.page, richMenuId: "richmenu-new-main" },
  ];
  const aliases = new Map([
    ["line_bot_v1-forms", "richmenu-old-forms"],
    ["line_bot_v1-attendance-in", "richmenu-old-main"],
  ]);
  let failed = false;
  const deleted: string[] = [];
  const client = publicationClient({
    get: async (id: string) => (id === created[0]?.richMenuId ? submenu.menu : main.menu),
    getAlias: async (name: string) => aliases.get(name) ?? null,
    updateAlias: async (name: string, id: string) => {
      aliases.set(name, id);
      if (name === "line_bot_v1-attendance-in" && id === "richmenu-new-main" && !failed) {
        failed = true;
        throw new Error("synthetic later-alias response loss");
      }
    },
    getDefault: async () => "richmenu-old-main",
    delete: async (id: string) => {
      deleted.push(id);
      return new Response(null, { status: 200 });
    },
  });

  await assert.rejects(
    activateRichMenuBatch(client, [main, submenu], created),
    /previous remote state was restored; retained new menus for reconciliation/,
  );
  assert.equal(failed, true);
  assert.equal(aliases.get("line_bot_v1-forms"), "richmenu-old-forms");
  assert.equal(aliases.get("line_bot_v1-attendance-in"), "richmenu-old-main");
  assert.deepEqual(deleted, []);
});

for (const failure of ["response-loss", "readback-failure"] as const) {
  test(`default activation ${failure} restores previous default and alias without deleting menus`, async () => {
    const home = config("attendance-in");
    const newId = "richmenu-new-main";
    const oldId = "richmenu-old-main";
    const alias = "line_bot_v1-attendance-in";
    const aliases = new Map([[alias, oldId]]);
    let defaultId = oldId;
    let defaultReads = 0;
    let injected = false;
    const deleted: string[] = [];
    const client = publicationClient({
      get: async () => home.menu,
      getAlias: async (name: string) => aliases.get(name) ?? null,
      updateAlias: async (name: string, id: string) => {
        aliases.set(name, id);
      },
      getDefault: async () => {
        defaultReads++;
        if (failure === "readback-failure" && defaultReads === 2) {
          injected = true;
          throw new Error("synthetic default readback unavailable");
        }
        return defaultId;
      },
      activate: async (id: string) => {
        defaultId = id;
        if (failure === "response-loss" && id === newId && !injected) {
          injected = true;
          throw new Error("synthetic default activation response lost");
        }
        return new Response(null, { status: 200 });
      },
      delete: async (id: string) => {
        deleted.push(id);
        return new Response(null, { status: 200 });
      },
    });

    await assert.rejects(
      activateRichMenuBatch(client, [home], [{ page: home.page, richMenuId: newId }]),
      /previous remote state was restored; retained new menus for reconciliation/,
    );
    assert.equal(injected, true);
    assert.equal(defaultId, oldId);
    assert.equal(aliases.get(alias), oldId);
    assert.deepEqual(deleted, []);
  });
}

test("default rollback failure reports incomplete recovery and retains new menus", async () => {
  const home = config("attendance-in");
  const oldId = "richmenu-old-main";
  const newId = "richmenu-new-main";
  let currentDefault = oldId;
  const aliases = new Map([["line_bot_v1-attendance-in", oldId]]);
  const deleted: string[] = [];
  const client = publicationClient({
    get: async () => home.menu,
    getAlias: async (name: string) => aliases.get(name) ?? null,
    updateAlias: async (name: string, id: string) => {
      aliases.set(name, id);
    },
    getDefault: async () => currentDefault,
    activate: async (id: string) => {
      if (id === oldId) throw new Error("synthetic rollback unavailable");
      currentDefault = id;
      throw new Error("synthetic activation response lost");
    },
    delete: async (id: string) => {
      deleted.push(id);
      return new Response(null, { status: 200 });
    },
  });

  await assert.rejects(
    activateRichMenuBatch(client, [home], [{ page: home.page, richMenuId: newId }]),
    /rollback incomplete \(default\); retained new menus for reconciliation/,
  );
  assert.equal(currentDefault, newId);
  assert.equal(aliases.get("line_bot_v1-attendance-in"), oldId);
  assert.deepEqual(deleted, []);
});

test("deprecated alias deletion with lost response restores prior state", async () => {
  const home = config("attendance-in");
  const oldId = "richmenu-old-main";
  const newId = "richmenu-new-main";
  const deprecated = "line_bot_v1-home";
  const aliases = new Map([
    ["line_bot_v1-attendance-in", oldId],
    [deprecated, oldId],
  ]);
  let defaultId = oldId;
  let injected = false;
  const deleted: string[] = [];
  const client = publicationClient({
    get: async () => home.menu,
    getAlias: async (name: string) => aliases.get(name) ?? null,
    updateAlias: async (name: string, id: string) => {
      aliases.set(name, id);
    },
    createAlias: async (name: string, id: string) => {
      aliases.set(name, id);
    },
    deleteAlias: async (name: string) => {
      aliases.delete(name);
      if (name === deprecated && !injected) {
        injected = true;
        throw new Error("synthetic deprecated alias deletion response lost");
      }
    },
    getDefault: async () => defaultId,
    activate: async (id: string) => {
      defaultId = id;
      return new Response(null, { status: 200 });
    },
    delete: async (id: string) => {
      deleted.push(id);
      return new Response(null, { status: 200 });
    },
  });

  await assert.rejects(
    activateRichMenuBatch(client, [home], [{ page: home.page, richMenuId: newId }]),
    /previous remote state was restored; retained new menus for reconciliation/,
  );
  assert.equal(injected, true);
  assert.equal(defaultId, oldId);
  assert.equal(aliases.get(deprecated), oldId);
  assert.equal(aliases.get("line_bot_v1-attendance-in"), oldId);
  assert.deepEqual(deleted, []);
});

test("publish keeps preflight before creation and activation in one process", async () => {
  const home = config("attendance-in");
  const events: string[] = [];
  let defaultId: string | null = null;
  const retiredAliases = [
    "line_bot_v1-home",
    "line_bot_v1-team-out",
    "line_bot_v1-forms-out",
    "line_bot_v1-notifications-out",
    "line_bot_v1-incident-out",
  ];
  const aliases = new Map<string, string>(
    retiredAliases.map((alias) => [alias, "richmenu-old0abcd"]),
  );
  const client = publicationClient({
    validate: async () => {
      events.push("validate");
      return new Response(null, { status: 200 });
    },
    create: async () => {
      events.push("create");
      return { richMenuId: "richmenu-new0abcd" };
    },
    upload: async () => {
      events.push("upload");
      return new Response(null, { status: 200 });
    },
    get: async () => home.menu,
    getAlias: async (alias: string) => aliases.get(alias) ?? null,
    createAlias: async (alias: string, id: string) => {
      events.push("alias");
      aliases.set(alias, id);
    },
    updateAlias: async (alias: string, id: string) => {
      aliases.set(alias, id);
    },
    deleteAlias: async (alias: string) => {
      aliases.delete(alias);
    },
    getDefault: async () => defaultId,
    activate: async (id: string) => {
      events.push("activate");
      defaultId = id;
      return new Response(null, { status: 200 });
    },
    deleteDefault: async () => new Response(null, { status: 200 }),
    delete: async () => new Response(null, { status: 200 }),
  });

  const result = await publishRichMenuBatch(client, [home]);

  assert.equal(result.activation.status, "activated");
  assert.equal(defaultId, "richmenu-new0abcd");
  assert.equal(aliases.get("line_bot_v1-attendance-in"), defaultId);
  assert.deepEqual(result.activation.removedAliases.sort(), [...retiredAliases].sort());
  for (const alias of retiredAliases) assert.equal(aliases.has(alias), false);
  assert.ok(events.indexOf("validate") < events.indexOf("create"));
  assert.ok(events.indexOf("upload") < events.indexOf("alias"));
  assert.ok(events.indexOf("alias") < events.indexOf("activate"));
});
