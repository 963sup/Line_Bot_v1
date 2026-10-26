import assert from "node:assert/strict";
import test from "node:test";
import { MENU_PAGES, SUBMENU_PAGES } from "../src/modules/assistant/rich-menu/definition";
import {
  activateRichMenuBatch,
  createRichMenuBatch,
  publishRichMenuBatch,
  publishRichMenuChanges,
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
    list: async () => [],
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
  fingerprint: page,
  assetSha256: page,
  definitionSha256: page,
  menu: {
    size: { width: 800, height: 250 },
    selected: true,
    name: `menu-${page}`,
    chatBarText: page,
    areas: [],
  },
});

test("publishes only changed menus and preserves the current default", async () => {
  const forms = config("forms");
  const aliases = new Map([["line_bot_v1-forms", "richmenu-old0abcd"]]);
  let defaultId: string | null = "richmenu-default0";
  const client = publicationClient({
    create: async () => ({ richMenuId: "richmenu-new0abcd" }),
    get: async () => forms.menu,
    getAlias: async (alias: string) => aliases.get(alias) ?? null,
    updateAlias: async (alias: string, id: string) => {
      aliases.set(alias, id);
    },
    getDefault: async () => defaultId,
    activate: async (id: string) => {
      defaultId = id;
      return new Response(null, { status: 200 });
    },
  });
  const result = await publishRichMenuChanges(client, [forms]);
  assert.deepEqual(result.published, ["forms"]);
  assert.equal(aliases.get("line_bot_v1-forms"), "richmenu-new0abcd");
  assert.equal(defaultId, "richmenu-default0");
});

test("changed-menu publication restores default after an activation failure", async () => {
  const home = config("attendance-in");
  const aliases = new Map([["line_bot_v1-attendance-in", "richmenu-old0abcd"]]);
  let defaultId: string | null = "richmenu-old0abcd";
  let activationAttempts = 0;
  const client = publicationClient({
    create: async () => ({ richMenuId: "richmenu-new0abcd" }),
    get: async () => home.menu,
    getAlias: async (alias: string) => aliases.get(alias) ?? null,
    updateAlias: async (alias: string, id: string) => {
      aliases.set(alias, id);
    },
    activate: async (id: string) => {
      defaultId = id;
      activationAttempts++;
      if (activationAttempts === 1) throw new Error("synthetic activation failure");
      return new Response(null, { status: 200 });
    },
    getDefault: async () => defaultId,
  });
  await assert.rejects(publishRichMenuChanges(client, [home]), /synthetic activation failure/);
  assert.equal(defaultId, "richmenu-old0abcd");
  assert.equal(aliases.get("line_bot_v1-attendance-in"), "richmenu-old0abcd");
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

for (const existing of [false, true]) {
  for (const failure of ["lost-response", "readback"] as const) {
    test(`first alias ${existing ? "update" : "create"} ${failure} restores the previous remote state without deleting new menus`, async () => {
      const home = config("attendance-in");
      const newId = "richmenu-new0abcd";
      const oldId = "richmenu-old0abcd";
      const alias = "line_bot_v1-attendance-in";
      const aliases = new Map<string, string>(existing ? [[alias, oldId]] : []);
      const deleted: string[] = [];
      let reads = 0;
      let writes = 0;
      const write = async (id: string) => {
        writes++;
        aliases.set(alias, id);
        if (failure === "lost-response" && writes === 1)
          throw new Error("remote committed; response lost");
      };
      const client = publicationClient({
        get: async () => home.menu,
        getAlias: async (key: string) => {
          if (key === alias) {
            reads++;
            // First read snapshots the old value; second checks it before mutation; third verifies the write.
            if (failure === "readback" && reads === 3)
              throw new Error("remote readback unavailable");
          }
          return aliases.get(key) ?? null;
        },
        createAlias: async (_key: string, id: string) => write(id),
        updateAlias: async (_key: string, id: string) => write(id),
        deleteAlias: async (key: string) => {
          aliases.delete(key);
        },
        getDefault: async () => oldId,
        delete: async (id: string) => {
          deleted.push(id);
          return new Response(null, { status: 200 });
        },
      });
      await assert.rejects(
        activateRichMenuBatch(client, [home], [{ page: home.page, richMenuId: newId }]),
        /previous remote state was restored; retained new menus/,
      );
      assert.equal(aliases.get(alias) ?? null, existing ? oldId : null);
      assert.deepEqual(deleted, []);
    });
  }
}

test("first unknown alias outcome with failed rollback retains new menus for reconciliation", async () => {
  const home = config("attendance-in");
  const alias = "line_bot_v1-attendance-in";
  const newId = "richmenu-new0abcd";
  const aliases = new Map<string, string>();
  const deleted: string[] = [];
  const client = publicationClient({
    get: async () => home.menu,
    getAlias: async (key: string) => aliases.get(key) ?? null,
    createAlias: async (key: string, id: string) => {
      aliases.set(key, id);
      throw new Error("response lost after commit");
    },
    deleteAlias: async () => {
      throw new Error("rollback unavailable");
    },
    getDefault: async () => null,
    delete: async (id: string) => {
      deleted.push(id);
      return new Response(null, { status: 200 });
    },
  });
  await assert.rejects(
    activateRichMenuBatch(client, [home], [{ page: home.page, richMenuId: newId }]),
    /rollback incomplete .*retained new menus for reconciliation/,
  );
  assert.equal(aliases.get(alias), newId);
  assert.deepEqual(deleted, []);
});

test("a later alias unknown result restores the complete previous state and retains new menus", async () => {
  const configs = [config("attendance-in"), config("attendance-out")];
  const created = configs.map(({ page }) => ({ page, richMenuId: `new-${page}` }));
  const aliases = new Map<string, string>([
    ["line_bot_v1-attendance-in", "old-attendance-in"],
    ["line_bot_v1-attendance-out", "old-attendance-out"],
  ]);
  const deleted: string[] = [];
  let defaultId: string | null = "old-attendance-in";
  let loseLaterResponse = true;
  const client = publicationClient({
    get: async (id: string) => {
      const found = configs.find(({ page }) => id === `new-${page}`);
      assert.ok(found);
      return found.menu;
    },
    getAlias: async (alias: string) => aliases.get(alias) ?? null,
    updateAlias: async (alias: string, id: string) => {
      aliases.set(alias, id);
      if (alias === "line_bot_v1-attendance-out" && loseLaterResponse) {
        loseLaterResponse = false;
        throw new Error("remote committed; later alias response lost");
      }
    },
    deleteAlias: async (alias: string) => {
      aliases.delete(alias);
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
    activateRichMenuBatch(client, configs, created),
    /previous remote state was restored; retained new menus/,
  );
  assert.equal(aliases.get("line_bot_v1-attendance-in"), "old-attendance-in");
  assert.equal(aliases.get("line_bot_v1-attendance-out"), "old-attendance-out");
  assert.equal(defaultId, "old-attendance-in");
  assert.deepEqual(deleted, []);
});

for (const hadDefault of [false, true]) {
  for (const failure of ["lost-response", "readback"] as const) {
    test(`default ${failure} restores ${hadDefault ? "existing" : "absent"} default while retaining new menus`, async () => {
      const home = config("attendance-in");
      const alias = "line_bot_v1-attendance-in";
      const newId = "richmenu-new0abcd";
      const oldId = "richmenu-old0abcd";
      const previousDefault = hadDefault ? oldId : null;
      const aliases = new Map<string, string>([[alias, oldId]]);
      const deleted: string[] = [];
      let defaultId: string | null = previousDefault;
      let defaultReads = 0;
      let activationWrites = 0;
      const client = publicationClient({
        get: async () => home.menu,
        getAlias: async (key: string) => aliases.get(key) ?? null,
        updateAlias: async (key: string, id: string) => {
          aliases.set(key, id);
        },
        deleteAlias: async (key: string) => {
          aliases.delete(key);
        },
        getDefault: async () => {
          defaultReads++;
          if (failure === "readback" && defaultReads === 2)
            throw new Error("default readback unavailable");
          return defaultId;
        },
        activate: async (id: string) => {
          activationWrites++;
          defaultId = id;
          if (failure === "lost-response" && activationWrites === 1)
            throw new Error("remote committed; default response lost");
          return new Response(null, { status: 200 });
        },
        deleteDefault: async () => {
          defaultId = null;
          return new Response(null, { status: 200 });
        },
        delete: async (id: string) => {
          deleted.push(id);
          return new Response(null, { status: 200 });
        },
      });

      await assert.rejects(
        activateRichMenuBatch(client, [home], [{ page: home.page, richMenuId: newId }]),
        /previous remote state was restored; retained new menus/,
      );
      assert.equal(aliases.get(alias), oldId);
      assert.equal(defaultId, previousDefault);
      assert.deepEqual(deleted, []);
    });
  }
}

test("same desired activation retries reconcile an unknown alias result without another alias write", async () => {
  const home = config("attendance-in");
  const alias = "line_bot_v1-attendance-in";
  const newId = "richmenu-new0abcd";
  const aliases = new Map<string, string>();
  const deleted: string[] = [];
  let defaultId: string | null = null;
  let aliasCreates = 0;
  let aliasUpdates = 0;
  let rollbackUnavailable = true;
  const client = publicationClient({
    get: async () => home.menu,
    getAlias: async (key: string) => aliases.get(key) ?? null,
    createAlias: async (key: string, id: string) => {
      aliasCreates++;
      aliases.set(key, id);
      throw new Error("remote committed; alias response lost");
    },
    updateAlias: async () => {
      aliasUpdates++;
    },
    deleteAlias: async (key: string) => {
      if (key === alias && rollbackUnavailable) {
        rollbackUnavailable = false;
        throw new Error("rollback unavailable");
      }
      aliases.delete(key);
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
      deleted.push(id);
      return new Response(null, { status: 200 });
    },
  });
  const created = [{ page: home.page, richMenuId: newId }];

  await assert.rejects(
    activateRichMenuBatch(client, [home], created),
    /rollback incomplete .*retained new menus for reconciliation/,
  );
  assert.equal(aliases.get(alias), newId);

  const retried = await activateRichMenuBatch(client, [home], created);
  assert.equal(retried.status, "activated");
  assert.equal(aliases.get(alias), newId);
  assert.equal(defaultId, newId);
  assert.equal(aliasCreates, 1);
  assert.equal(aliasUpdates, 0);
  assert.deepEqual(deleted, []);
});

test("known create batch failure cleans up menus without alias or default publication", async () => {
  const home = config("attendance-in");
  const newId = "richmenu-new0abcd";
  const deleted: string[] = [];
  let publicationWrites = 0;
  const client = publicationClient({
    create: async () => ({ richMenuId: newId }),
    upload: async () => new Response(null, { status: 200 }),
    get: async () => ({}),
    delete: async (id: string) => {
      deleted.push(id);
      return new Response(null, { status: 200 });
    },
    createAlias: async () => {
      publicationWrites++;
    },
    updateAlias: async () => {
      publicationWrites++;
    },
    deleteAlias: async () => {
      publicationWrites++;
    },
    deleteDefault: async () => {
      publicationWrites++;
      return new Response(null, { status: 200 });
    },
    activate: async () => {
      publicationWrites++;
      return new Response(null, { status: 200 });
    },
  });

  await assert.rejects(createRichMenuBatch(client, [home]), /newly created menus were removed/);
  assert.deepEqual(deleted, [newId]);
  assert.equal(publicationWrites, 0);
});

test("activation readback failure before publication conservatively retains created menus", async () => {
  const home = config("attendance-in");
  const newId = "richmenu-new0abcd";
  const deleted: string[] = [];
  let publicationWrites = 0;
  const client = publicationClient({
    get: async () => {
      throw new Error("definition readback unavailable");
    },
    delete: async (id: string) => {
      deleted.push(id);
      return new Response(null, { status: 200 });
    },
    createAlias: async () => {
      publicationWrites++;
    },
    updateAlias: async () => {
      publicationWrites++;
    },
    deleteAlias: async () => {
      publicationWrites++;
    },
    deleteDefault: async () => {
      publicationWrites++;
      return new Response(null, { status: 200 });
    },
    activate: async () => {
      publicationWrites++;
      return new Response(null, { status: 200 });
    },
  });

  await assert.rejects(
    activateRichMenuBatch(client, [home], [{ page: home.page, richMenuId: newId }]),
    /definition readback unavailable/,
  );
  assert.deepEqual(deleted, []);
  assert.equal(publicationWrites, 0);
});
