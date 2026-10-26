import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { richMenuImage } from "@line_bot_v1/line/rich-menu";
import { lineBotV1RichMenu, type MenuPage, menuAsset } from "./definition";
import { richMenuDefinitionHash, richMenuFingerprint, sha256 } from "./fingerprint";

export type DesiredRichMenu = {
  page: MenuPage;
  image: string;
  upload: Uint8Array;
  menu: ReturnType<typeof lineBotV1RichMenu>;
  fingerprint: string;
  assetSha256: string;
  definitionSha256: string;
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
    const baseMenu = lineBotV1RichMenu(miniAppUrl, size, page);
    const fingerprint = richMenuFingerprint({ page, image: upload, menu: baseMenu });
    return {
      page,
      image,
      upload,
      menu: { ...baseMenu, name: `${baseMenu.name}/rm-${fingerprint.slice(0, 12)}` },
      fingerprint,
      assetSha256: sha256(upload),
      definitionSha256: richMenuDefinitionHash(baseMenu),
    };
  });
}
