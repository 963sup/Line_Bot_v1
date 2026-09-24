import assert from "node:assert/strict";
import test from "node:test";
import {
  activateRichMenuBatch,
  createRichMenuBatch,
  publishRichMenuBatch,
  type RichMenuPublicationConfig,
} from "../src/modules/assistant/rich-menu/publication.server";

type PublicationClient = Parameters<typeof createRichMenuBatch>[0];

const config = (page: RichMenuPublicationConfig["page"]): RichMenuPublicationConfig => ({
  page,
  image: `assets/${page}.png`,
  upload: new Uint8Array([1, 2, 3]),
  menu: {
    size: { width: 800, height: 250 },
    selected: true,
    name: `menu-${page}`,
    chatBarText: page,
    areas: [],
  },
});

test("create batch removes every known menu created in a failed operation", async () => {
  const configs = [config("home"), config("attendance-in")];
  const deleted: string[] = [];
  let creates = 0;
  const client = {
    validate: async () => new Response(null, { status: 200 }),
    create: async () => ({ richMenuId: `richmenu-0000000${++creates}` }),
    upload: async (id: string) => {
      if (id.endsWith("2")) throw new Error("synthetic upload failure");
      return new Response(null, { status: 200 });
    },
    get: async () => configs[0]!.menu,
    delete: async (id: string) => {
      deleted.push(id);
      return new Response(null, { status: 200 });
    },
  } as unknown as PublicationClient;

  await assert.rejects(createRichMenuBatch(client, configs), /newly created menus were removed/);
  assert.deepEqual(deleted, ["richmenu-00000002", "richmenu-00000001"]);
});

test("activation failure restores default and aliases while retaining new menus", async () => {
  const home = config("home");
  const newId = "richmenu-new0abcd";
  const oldId = "richmenu-old0abcd";
  const legacyId = "richmenu-legacyabcd";
  const aliases = new Map<string, string>([
    ["work-assistant-home", oldId],
    ["work-assistant-tasks", legacyId],
  ]);
  let defaultId: string | null = oldId;
  let failDeprecatedDelete = true;
  const deletedMenus: string[] = [];
  const client = {
    get: async () => home.menu,
    getAlias: async (alias: string) => aliases.get(alias) ?? null,
    createAlias: async (alias: string, id: string) => {
      aliases.set(alias, id);
    },
    updateAlias: async (alias: string, id: string) => {
      aliases.set(alias, id);
    },
    deleteAlias: async (alias: string) => {
      if (alias === "work-assistant-tasks" && failDeprecatedDelete) {
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
  } as unknown as PublicationClient;

  await assert.rejects(
    activateRichMenuBatch(client, [home], [{ page: "home", richMenuId: newId }]),
    /previous remote state was restored; retained new menus/,
  );

  assert.equal(defaultId, oldId);
  assert.equal(aliases.get("work-assistant-home"), oldId);
  assert.equal(aliases.get("work-assistant-tasks"), legacyId);
  assert.deepEqual(deletedMenus, []);
});

test("publish keeps preflight before creation and activation in one process", async () => {
  const home = config("home");
  const events: string[] = [];
  let defaultId: string | null = null;
  const aliases = new Map<string, string>();
  const client = {
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
  } as unknown as PublicationClient;

  const result = await publishRichMenuBatch(client, [home]);

  assert.equal(result.activation.status, "activated");
  assert.ok(events.indexOf("validate") < events.indexOf("create"));
  assert.ok(events.indexOf("upload") < events.indexOf("alias"));
  assert.ok(events.indexOf("alias") < events.indexOf("activate"));
});
