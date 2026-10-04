import type { RichMenuTransport } from "./transport.js";

export function createRichMenuAliasOperations(transport: RichMenuTransport) {
  return {
    async getAlias(alias: string) {
      return transport.responseId(
        await transport.request(
          `richmenu/alias/${transport.checkedAlias(alias)}`,
          undefined,
          "GET",
        ),
      );
    },
    async createAlias(alias: string, id: string) {
      await transport.request("richmenu/alias", {
        richMenuAliasId: transport.checkedAlias(alias),
        richMenuId: transport.checkedId(id),
      });
    },
    async updateAlias(alias: string, id: string) {
      await transport.request(`richmenu/alias/${transport.checkedAlias(alias)}`, {
        richMenuId: transport.checkedId(id),
      });
    },
    async deleteAlias(alias: string) {
      await transport.request(
        `richmenu/alias/${transport.checkedAlias(alias)}`,
        undefined,
        "DELETE",
      );
    },
  };
}
