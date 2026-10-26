import { resolve } from "node:path";
import { createRichMenuClient } from "@line_bot_v1/line/rich-menu";
import {
  isMenuPage,
  MENU_PAGES,
  menuAlias,
} from "../../apps/web/src/modules/assistant/rich-menu/definition";
import { buildRichMenuDesiredState } from "../../apps/web/src/modules/assistant/rich-menu/desired-state.server";
import {
  preflightRichMenuBatch,
  publishRichMenuChanges,
} from "../../apps/web/src/modules/assistant/rich-menu/publication.server";

const [command = "preview", target = "all"] = process.argv.slice(2);
const repositoryRoot = resolve(import.meta.dirname, "../..");

try {
  const result = await runRichMenuOperation(command, target, repositoryRoot);
  console.log(
    JSON.stringify({ revision: process.env.GITHUB_SHA ?? "local", command, target, result }),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "Rich Menu operation failed";
  console.error(JSON.stringify({ command, target, error: message }));
  process.exitCode = 1;
}

async function runRichMenuOperation(command: string, target: string, root: string) {
  const commands = ["preview", "preflight", "reconcile", "drift"] as const;
  if (!commands.some((candidate) => candidate === command))
    throw new Error("Use preview <page|all>, preflight all, reconcile all, drift all");
  if (target !== "all" && !isMenuPage(target)) throw new Error("Unknown menu page");
  const pages = target === "all" ? MENU_PAGES : [target];
  const configs = buildRichMenuDesiredState(pages, root);
  if (command === "preview")
    return configs.map(({ page, image, upload, menu, assetSha256, definitionSha256 }) => ({
      page,
      image,
      bytes: upload.length,
      size: menu.size,
      areas: menu.areas.length,
      fingerprint: menu.name.match(/\/rm-([a-f0-9]{12})$/)?.[1] ?? null,
      assetSha256,
      definitionSha256,
    }));
  if (target !== "all") throw new Error(`${command} requires all menu pages`);
  const client = createRichMenuClient(process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "");
  if (command === "preflight") return preflightRichMenuBatch(client, configs);
  const remoteMenus = await client.list();
  const remoteById = new Map(remoteMenus.map((menu) => [menu.richMenuId, menu]));
  const actions: Array<{
    page: (typeof configs)[number]["page"];
    alias: string;
    currentId: string | null;
    action: "publish" | "unchanged";
    fingerprint: string;
    assetSha256: string;
    definitionSha256: string;
  }> = configs.map((config) => ({
    page: config.page,
    alias: menuAlias(config.page),
    currentId: null,
    action: "publish",
    fingerprint: config.fingerprint,
    assetSha256: config.assetSha256,
    definitionSha256: config.definitionSha256,
  }));
  for (const action of actions) {
    const currentId = await client.getAlias(action.alias);
    action.currentId = currentId;
    const current = currentId ? remoteById.get(currentId) : undefined;
    if (current?.name.endsWith(`/rm-${action.fingerprint.slice(0, 12)}`))
      action.action = "unchanged";
  }
  const changed = configs.filter((config) =>
    actions.some((action) => action.page === config.page && action.action === "publish"),
  );
  const published = await publishRichMenuChanges(client, changed);
  const expectedDefault = await client.getAlias(menuAlias("attendance-in"));
  const currentDefault = await client.getDefault();
  if (expectedDefault && currentDefault !== expectedDefault) {
    await client.activate(expectedDefault);
    if ((await client.getDefault()) !== expectedDefault)
      throw new Error("Default Rich Menu readback mismatch");
  }
  return {
    status: command === "drift" ? "drift-reconciled" : "reconciled",
    actions,
    published: published.published,
    default: expectedDefault ?? currentDefault,
  };
}
