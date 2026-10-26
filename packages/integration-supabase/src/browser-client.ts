import { createClient } from "@supabase/supabase-js";

export function createBrowserClient(config: { url: string; publishableKey: string }) {
  return createClient(config.url, config.publishableKey, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
      storage: {
        getItem: (key) => localStorage.getItem(key),
        removeItem: (key) => localStorage.removeItem(key),
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
          localStorage.setItem(key, stored);
        },
      },
    },
  });
}

export function createPublicAuthClient(config: { url: string; publishableKey: string }) {
  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
