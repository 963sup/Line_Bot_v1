import { isDeepStrictEqual } from "node:util";
import { createRichMenuClient, type RichMenuDefinition } from "@line_bot_v1/line-channel/rich-menu";
import { MENU_PAGES, type MenuPage, menuAlias, SUBMENU_PAGES } from "./definition";
import type { DesiredRichMenu } from "./desired-state.server";

export type RichMenuPublicationConfig = DesiredRichMenu;
type RichMenuClient = ReturnType<typeof createRichMenuClient>;
type CreatedMenu = { page: MenuPage; richMenuId: string };

const legacyAliasPrefix = ["work", "assistant"].join("-");
const retiredPages = ["home", "team-out", "forms-out", "notifications-out", "incident-out"];
const deprecatedAliases = [
  ...retiredPages.map((page) => `line_bot_v1-${page}`),
  ...retiredPages.map((page) => `${legacyAliasPrefix}-${page}`),
  ...MENU_PAGES.map((page) => `${legacyAliasPrefix}-${page}`),
  `${legacyAliasPrefix}-tasks`,
  `${legacyAliasPrefix}-tasks-out`,
  `${legacyAliasPrefix}-announcements`,
  `${legacyAliasPrefix}-announcements-out`,
];

async function assertRemoteDefinition(
  client: RichMenuClient,
  id: string,
  menu: RichMenuDefinition,
  page: MenuPage,
) {
  const actual = await client.get(id);
  if (
    !actual ||
    typeof actual !== "object" ||
    !isDeepStrictEqual(
      {
        size: (actual as RichMenuDefinition).size,
        selected: (actual as RichMenuDefinition).selected,
        name: (actual as RichMenuDefinition).name,
        chatBarText: (actual as RichMenuDefinition).chatBarText,
        areas: (actual as RichMenuDefinition).areas,
      },
      menu,
    )
  )
    throw new Error(`Rich menu definition readback mismatch: ${page}`);
}

async function setAlias(client: RichMenuClient, alias: string, id: string) {
  const current = await client.getAlias(alias);
  if (!current) await client.createAlias(alias, id);
  else if (current !== id) await client.updateAlias(alias, id);
  if ((await client.getAlias(alias)) !== id) throw new Error(`Alias readback mismatch: ${alias}`);
  return current !== id;
}

async function restoreAlias(client: RichMenuClient, alias: string, previous: string | null) {
  const current = await client.getAlias(alias);
  if (!previous) {
    if (current) await client.deleteAlias(alias);
    if (await client.getAlias(alias)) throw new Error(`Alias rollback mismatch: ${alias}`);
    return;
  }
  if (!current) await client.createAlias(alias, previous);
  else if (current !== previous) await client.updateAlias(alias, previous);
  if ((await client.getAlias(alias)) !== previous)
    throw new Error(`Alias rollback mismatch: ${alias}`);
}

async function deleteCreatedMenus(client: RichMenuClient, created: CreatedMenu[]) {
  const failures: string[] = [];
  for (const menu of [...created].reverse()) {
    try {
      await client.delete(menu.richMenuId);
    } catch {
      failures.push(menu.richMenuId);
    }
  }
  return failures;
}

export async function preflightRichMenuBatch(
  client: RichMenuClient,
  configs: RichMenuPublicationConfig[],
) {
  for (const config of configs) await client.validate(config.menu);
  const aliases: Record<string, string | null> = {};
  for (const config of configs)
    aliases[menuAlias(config.page)] = await client.getAlias(menuAlias(config.page));
  return {
    status: "ready",
    pages: configs.map((config) => config.page),
    currentDefault: await client.getDefault(),
    aliases,
  };
}

export async function createRichMenuBatch(
  client: RichMenuClient,
  configs: RichMenuPublicationConfig[],
) {
  const created: CreatedMenu[] = [];
  let unknownCreatePage: MenuPage | null = null;
  try {
    for (const config of configs) await client.validate(config.menu);
    for (const config of configs) {
      let richMenuId = "";
      try {
        ({ richMenuId } = await client.create(config.menu));
      } catch {
        unknownCreatePage = config.page;
        throw new Error(`Rich menu create result is unknown: ${config.page}`);
      }
      created.push({ page: config.page, richMenuId });
      await client.upload(richMenuId, config.upload);
      await assertRemoteDefinition(client, richMenuId, config.menu, config.page);
    }
    return created;
  } catch {
    const cleanupFailures = await deleteCreatedMenus(client, created);
    if (unknownCreatePage || cleanupFailures.length) {
      const details = [
        unknownCreatePage ? `unknown create page=${unknownCreatePage}` : "",
        cleanupFailures.length ? `cleanup failed=${cleanupFailures.join(",")}` : "",
      ]
        .filter(Boolean)
        .join("; ");
      throw new Error(
        `Rich menu creation failed; remote reconciliation required${details ? `: ${details}` : ""}.`,
      );
    }
    throw new Error("Rich menu creation failed; newly created menus were removed.");
  }
}

export async function activateRichMenuBatch(
  client: RichMenuClient,
  configs: RichMenuPublicationConfig[],
  created: CreatedMenu[],
) {
  const byPage = new Map(configs.map((config) => [config.page, config]));
  if (created.length !== configs.length) throw new Error("Rich menu set is incomplete");
  for (const menu of created) {
    const config = byPage.get(menu.page);
    if (!config) throw new Error(`Unknown rich menu page: ${menu.page}`);
    await assertRemoteDefinition(client, menu.richMenuId, config.menu, menu.page);
  }

  const defaultMenu = created.find((menu) => menu.page === "attendance-in");
  if (!defaultMenu) throw new Error("Attendance-in Rich Menu is missing");

  const aliasNames = [
    ...new Set<string>([...configs.map((config) => menuAlias(config.page)), ...deprecatedAliases]),
  ];
  const previousAliases: Record<string, string | null> = {};
  for (const alias of aliasNames) previousAliases[alias] = await client.getAlias(alias);
  const previousDefault = await client.getDefault();

  let mutated = false;
  try {
    const activationOrder = [...created].sort(
      (a, b) =>
        Number(SUBMENU_PAGES.some((page) => page === b.page)) -
        Number(SUBMENU_PAGES.some((page) => page === a.page)),
    );
    for (const menu of activationOrder)
      mutated = (await setAlias(client, menuAlias(menu.page), menu.richMenuId)) || mutated;

    mutated = true;

    if (previousDefault !== defaultMenu.richMenuId) await client.activate(defaultMenu.richMenuId);
    if ((await client.getDefault()) !== defaultMenu.richMenuId)
      throw new Error("Default readback mismatch");

    const removedAliases: string[] = [];
    for (const alias of deprecatedAliases) {
      if (!(await client.getAlias(alias))) continue;
      await client.deleteAlias(alias);
      if (await client.getAlias(alias)) throw new Error(`Deprecated alias still exists: ${alias}`);
      removedAliases.push(alias);
    }
    return {
      status: "activated",
      default: defaultMenu.richMenuId,
      clockInId: created.find((menu) => menu.page === "attendance-in")?.richMenuId ?? null,
      clockOutId: created.find((menu) => menu.page === "attendance-out")?.richMenuId ?? null,
      removedAliases,
      mobileVerification: "pending",
      previousDefault,
      previousAliases,
    };
  } catch {
    if (!mutated) {
      const cleanupFailures = await deleteCreatedMenus(client, created);
      if (cleanupFailures.length)
        throw new Error(
          `Rich menu activation failed before remote publication; cleanup failed for ${cleanupFailures.join(",")}.`,
        );
      throw new Error(
        "Rich menu activation failed before remote publication; newly created menus were removed.",
      );
    }

    const recoveryErrors: string[] = [];
    try {
      const currentDefault = await client.getDefault();
      if (previousDefault) {
        if (currentDefault !== previousDefault) await client.activate(previousDefault);
      } else if (currentDefault) await client.deleteDefault();
      if ((await client.getDefault()) !== previousDefault) throw new Error("default");
    } catch {
      recoveryErrors.push("default");
    }

    for (const alias of aliasNames) {
      try {
        await restoreAlias(client, alias, previousAliases[alias] ?? null);
      } catch {
        recoveryErrors.push(`alias:${alias}`);
      }
    }

    const retained = created.map((menu) => menu.richMenuId).join(",");
    if (recoveryErrors.length)
      throw new Error(
        `Rich menu activation failed; rollback incomplete (${recoveryErrors.join(",")}); retained new menus for reconciliation: ${retained}.`,
      );
    throw new Error(
      `Rich menu activation failed; previous remote state was restored; retained new menus for reconciliation: ${retained}.`,
    );
  }
}

export async function publishRichMenuBatch(
  client: RichMenuClient,
  configs: RichMenuPublicationConfig[],
) {
  const preflight = await preflightRichMenuBatch(client, configs);
  const created = await createRichMenuBatch(client, configs);
  const activation = await activateRichMenuBatch(client, configs, created);
  return { preflight, created, activation };
}
