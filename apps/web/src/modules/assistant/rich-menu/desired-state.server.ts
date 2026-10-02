import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { richMenuImage } from "@line_bot_v1/line/rich-menu";
import { lineBotV1RichMenu, type MenuPage, menuAsset } from "./definition";

export type DesiredRichMenu = {
  page: MenuPage;
  image: string;
  upload: Uint8Array;
  menu: ReturnType<typeof lineBotV1RichMenu>;
};

export function buildRichMenuDesiredState(
  pages: readonly MenuPage[],
  repositoryRoot: string,
): DesiredRichMenu[] {
  const miniAppUrl = lineMiniApp().url;
  return pages.map((page) => {
    const image = `assets/line/rich-menu/${menuAsset(page)}`;
    const upload = readFileSync(resolve(repositoryRoot, image));
    const imageDetails = richMenuImage(upload);
    const size = { width: imageDetails.width, height: imageDetails.height };
    return {
      page,
      image,
      upload,
      menu: lineBotV1RichMenu(miniAppUrl, size, page),
    };
  });
}
