import { createRichMenuClient } from "@line-work/line-channel/adapters/messaging";
import { isMenuPage, MENU_PAGES, type MenuPage } from "./definition";
import { buildRichMenuDesiredState } from "./desired-state.server";
import { preflightRichMenuBatch, publishRichMenuBatch } from "./publication.server";

const commands = ["preview", "preflight", "publish"] as const;
export type RichMenuCommand = (typeof commands)[number];

export async function runRichMenuOperation(input: {
  command: string;
  target: string;
  repositoryRoot: string;
  channelAccessToken?: string;
}) {
  if (!commands.some((command) => command === input.command))
    throw new Error("Use preview <page|all>, preflight all, publish all");
  if (input.target !== "all" && !isMenuPage(input.target)) throw new Error("Unknown menu page");

  const command = input.command as RichMenuCommand;
  const pages = input.target === "all" ? MENU_PAGES : ([input.target as MenuPage] as const);
  const configs = buildRichMenuDesiredState(pages, input.repositoryRoot);

  if (command === "preview") {
    return configs.map(({ page, image, upload, menu }) => ({
      page,
      image,
      bytes: upload.length,
      size: menu.size,
      areas: menu.areas,
    }));
  }

  if (input.target !== "all") throw new Error(`${command} requires all menu pages`);
  const client = createRichMenuClient(input.channelAccessToken ?? "");
  if (command === "preflight") return preflightRichMenuBatch(client, configs);
  return publishRichMenuBatch(client, configs);
}
