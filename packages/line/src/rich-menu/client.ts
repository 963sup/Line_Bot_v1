import "../server.js";
import { createRichMenuAliasOperations } from "./alias.js";
import { createRichMenuOperations } from "./menu.js";
import { createRichMenuTransport } from "./transport.js";
import type { RichMenuDefinition } from "./types.js";
import { createRichMenuUserLinkOperations } from "./user-link.js";

export type { RichMenuDefinition } from "./types.js";

export function createRichMenuClient(token: string, fetcher: typeof fetch = fetch) {
  const transport = createRichMenuTransport(token, fetcher);
  const menu = createRichMenuOperations(transport);
  const alias = createRichMenuAliasOperations(transport);
  const userLink = createRichMenuUserLinkOperations(transport);

  return {
    validate: menu.validate,
    create: menu.create,
    upload: menu.upload,
    get: menu.get,
    delete: menu.delete,
    getAlias: alias.getAlias,
    createAlias: alias.createAlias,
    updateAlias: alias.updateAlias,
    deleteAlias: alias.deleteAlias,
    getUserMenu: userLink.getUserMenu,
    getDefault: menu.getDefault,
    activate: menu.activate,
    deleteDefault: menu.deleteDefault,
    linkUser: userLink.linkUser,
  };
}
