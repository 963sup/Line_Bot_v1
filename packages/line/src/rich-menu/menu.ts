import type { RichMenuTransport } from "./transport.js";
import type { RichMenuDefinition } from "./types.js";

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
    getDefault: async () =>
      transport.responseId(await transport.request("user/all/richmenu", undefined, "GET")),
    activate: (id: string) =>
      transport.request(`user/all/richmenu/${transport.checkedId(id)}`),
    deleteDefault: () => transport.request("user/all/richmenu", undefined, "DELETE"),
  };
}
