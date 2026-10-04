import type { RichMenuTransport } from "./transport.js";

export function createRichMenuUserLinkOperations(transport: RichMenuTransport) {
  return {
    getUserMenu: async (userId: string) =>
      transport.responseId(
        await transport.request(
          `user/${transport.checkedUserId(userId)}/richmenu`,
          undefined,
          "GET",
        ),
      ),
    async linkUser(userId: string, richMenuId: string): Promise<void> {
      await transport.request(
        `user/${transport.checkedUserId(userId)}/richmenu/${transport.checkedId(richMenuId)}`,
      );
    },
  };
}
