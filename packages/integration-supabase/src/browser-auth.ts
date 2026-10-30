import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Browser provider client. The host owns public configuration and callback navigation. */
export function createBrowserSupabaseClient(
  url: string,
  publishableKey: string,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
): SupabaseClient {
  return createClient(url, publishableKey, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
      storage: {
        getItem: (key) => storage.getItem(key),
        removeItem: (key) => storage.removeItem(key),
        setItem: (key, value) => {
          let stored = value;
          try {
            const data = JSON.parse(value);
            if (data && typeof data === "object") {
              delete data.provider_token;
              delete data.provider_refresh_token;
              stored = JSON.stringify(data);
            }
          } catch {
            /* PKCE verifier is plain text. */
          }
          storage.setItem(key, stored);
        },
      },
    },
  });
}
