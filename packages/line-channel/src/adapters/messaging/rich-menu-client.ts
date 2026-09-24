import { richMenuImage } from "./rich-menu-image.js";

export type RichMenuDefinition = {
  size: { width: number; height: number };
  selected: boolean;
  name: string;
  chatBarText: string;
  areas: Array<{
    bounds: { x: number; y: number; width: number; height: number };
    action:
      | { type: "uri"; label: string; uri: string }
      | { type: "postback"; label: string; data: string }
      | { type: "richmenuswitch"; label: string; richMenuAliasId: string; data: string };
  }>;
};

export function createRichMenuClient(token: string, fetcher: typeof fetch = fetch) {
  if (!token) throw new Error("LINE channel access token required");
  function checkedId(id: string) {
    if (!/^richmenu-[a-f0-9]+$/.test(id)) throw new Error("Invalid rich menu ID");
    return id;
  }
  function checkedUserId(userId: string) {
    if (!/^U[0-9a-f]{32}$/i.test(userId)) throw new Error("Invalid LINE user ID");
    return userId;
  }
  function checkedAlias(alias: string) {
    if (!/^[a-z0-9_-]{1,32}$/.test(alias)) throw new Error("Invalid rich menu alias");
    return alias;
  }
  async function request(
    path: string,
    body?: RichMenuDefinition | Uint8Array | { richMenuAliasId?: string; richMenuId: string },
    method = "POST",
  ) {
    const image = body instanceof Uint8Array;
    const imageDetails = image ? richMenuImage(body) : null;
    const response = await fetcher(`https://${image ? "api-data" : "api"}.line.me/v2/bot/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": imageDetails?.mimeType ?? "application/json",
      },
      ...(body ? { body: image ? new Uint8Array(body).buffer : JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    if (method === "GET" && response.status === 404) return null;
    if (!response.ok) throw new Error(`LINE rich menu HTTP ${response.status}; no automatic retry`);
    return response;
  }
  async function responseId(response: Response | null) {
    if (!response) return null;
    const value: unknown = await response.json();
    if (
      !value ||
      typeof value !== "object" ||
      !("richMenuId" in value) ||
      typeof value.richMenuId !== "string"
    )
      throw new Error("Invalid LINE menu response");
    return checkedId(value.richMenuId);
  }
  return {
    validate: (menu: RichMenuDefinition) => request("richmenu/validate", menu),
    async create(menu: RichMenuDefinition) {
      const richMenuId = await responseId(await request("richmenu", menu));
      if (!richMenuId) throw new Error("Missing menu ID");
      return { richMenuId };
    },
    upload(id: string, image: Uint8Array) {
      return request(`richmenu/${checkedId(id)}/content`, image);
    },
    async get(id: string) {
      const response = await request(`richmenu/${checkedId(id)}`, undefined, "GET");
      if (!response) throw new Error("Rich menu not found in this channel");
      return response.json();
    },
    delete(id: string) {
      return request(`richmenu/${checkedId(id)}`, undefined, "DELETE");
    },
    async getAlias(alias: string) {
      return responseId(await request(`richmenu/alias/${checkedAlias(alias)}`, undefined, "GET"));
    },
    async createAlias(alias: string, id: string) {
      await request("richmenu/alias", {
        richMenuAliasId: checkedAlias(alias),
        richMenuId: checkedId(id),
      });
    },
    async updateAlias(alias: string, id: string) {
      await request(`richmenu/alias/${checkedAlias(alias)}`, { richMenuId: checkedId(id) });
    },
    async deleteAlias(alias: string) {
      await request(`richmenu/alias/${checkedAlias(alias)}`, undefined, "DELETE");
    },
    getUserMenu: async (userId: string) =>
      responseId(await request(`user/${checkedUserId(userId)}/richmenu`, undefined, "GET")),
    getDefault: async () => responseId(await request("user/all/richmenu", undefined, "GET")),
    activate: (id: string) => request(`user/all/richmenu/${checkedId(id)}`),
    deleteDefault: () => request("user/all/richmenu", undefined, "DELETE"),
    async linkUser(userId: string, richMenuId: string): Promise<void> {
      await request(`user/${checkedUserId(userId)}/richmenu/${checkedId(richMenuId)}`);
    },
  };
}
