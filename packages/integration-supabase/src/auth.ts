import { createPublicAuthClient } from "./browser-client.js";

export async function getUserByAccessToken(
  config: { url: string; publishableKey: string },
  token: string,
) {
  return (await createPublicAuthClient(config).auth.getUser(token)).data.user;
}
