import "../server.js";
import { requireValue } from "../config.js";
import { richMenuImage } from "./image.js";
import type { RichMenuDefinition } from "./types.js";

type RichMenuRequestBody =
  | RichMenuDefinition
  | Uint8Array
  | { richMenuAliasId?: string; richMenuId: string };

export function createRichMenuTransport(token: string, fetcher: typeof fetch) {
  const accessToken = requireValue(token, "LINE_CHANNEL_ACCESS_TOKEN");

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

  async function request(path: string, body?: RichMenuRequestBody, method = "POST") {
    const image = body instanceof Uint8Array;
    const imageDetails = image ? richMenuImage(body) : null;
    const response = await fetcher(`https://${image ? "api-data" : "api"}.line.me/v2/bot/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
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
    checkedAlias,
    checkedId,
    checkedUserId,
    request,
    responseId,
  };
}

export type RichMenuTransport = ReturnType<typeof createRichMenuTransport>;
