import type { RichMenuTransport } from "./transport.js";
import type { RichMenuDefinition, RichMenuSummary } from "./types.js";

export function createRichMenuOperations(transport: RichMenuTransport) {
  return {
    validate: (menu: RichMenuDefinition) => transport.request("richmenu/validate", menu),
    async create(menu: RichMenuDefinition) {
      const richMenuId = await transport.responseId(await transport.request("richmenu", menu));
      if (!richMenuId) throw new Error("Missing menu ID");
      return { richMenuId };
    },
    upload(id: string, image: Uint8Array) {
      return transport.request(`richmenu/${transport.checkedId(id)}/content`, image);
    },
    async get(id: string) {
      const response = await transport.request(
        `richmenu/${transport.checkedId(id)}`,
        undefined,
        "GET",
      );
      if (!response) throw new Error("Rich menu not found in this channel");
      return response.json();
    },
    delete(id: string) {
      return transport.request(`richmenu/${transport.checkedId(id)}`, undefined, "DELETE");
    },
    async list(): Promise<RichMenuSummary[]> {
      const response = await transport.request("richmenu/list", undefined, "GET");
      if (!response) return [];
      const value: unknown = await response.json();
      if (!value || typeof value !== "object" || !("richmenus" in value))
        throw new Error("Invalid LINE rich menu list response");
      const menus = value.richmenus;
      if (!Array.isArray(menus)) throw new Error("Invalid LINE rich menu list response");
      return menus.map((menu): RichMenuSummary => {
        if (!menu || typeof menu !== "object" || !("richMenuId" in menu))
          throw new Error("Invalid LINE rich menu list item");
        const id = menu.richMenuId;
        if (typeof id !== "string") throw new Error("Invalid LINE rich menu list ID");
        if (!("name" in menu) || typeof menu.name !== "string")
          throw new Error("Invalid LINE rich menu list name");
        return { richMenuId: transport.checkedId(id), name: menu.name };
      });
    },
    getDefault: async () =>
      transport.responseId(await transport.request("user/all/richmenu", undefined, "GET")),
    activate: (id: string) => transport.request(`user/all/richmenu/${transport.checkedId(id)}`),
    deleteDefault: () => transport.request("user/all/richmenu", undefined, "DELETE"),
  };
}
