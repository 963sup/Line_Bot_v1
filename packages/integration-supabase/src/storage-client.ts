import { createClient } from "@supabase/supabase-js";

export function createPrivateStorageClient(config: { url: string; serviceRoleKey: string }) {
  return createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: init?.signal
            ? AbortSignal.any([init.signal, AbortSignal.timeout(90_000)])
            : AbortSignal.timeout(90_000),
        }),
    },
  });
}
