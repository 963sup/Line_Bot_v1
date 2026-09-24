import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { richMenuImage } from "@line-work/line-channel/adapters/messaging";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { type MenuPage, menuAsset, workAssistantRichMenu } from "./definition";

export type DesiredRichMenu = {
  page: MenuPage;
  image: string;
  upload: Uint8Array;
  menu: ReturnType<typeof workAssistantRichMenu>;
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
      menu: workAssistantRichMenu(miniAppUrl, size, page),
    };
  });
}
