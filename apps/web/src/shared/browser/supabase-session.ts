"use client";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;
export async function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Google 登入尚未設定，請稍後再試。");
  // LINE-only requests do not need the Google authentication SDK.
  const { createClient } = await import("@supabase/supabase-js");
  return (client ??= createClient(url, key, {
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
  }));
}
export async function sessionToken() {
  const { data, error } = await (await supabase()).auth.getSession();
  if (error || !data.session) throw new Error("請先登入 Google。");
  return data.session.access_token;
}
export async function googleLogin() {
  // PKCE 往返留在同一外部分頁；返回後只提交候選 Google 身分。
  sessionStorage.setItem("loginReturn", "/google-link?complete=1");
  const { error } = await (await supabase()).auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: location.origin + "/auth/callback",
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw new Error("Google 登入暫不可用。");
}
export async function authHeaders(lineToken: string): Promise<Record<string, string>> {
  return {
    "X-Line-Token": lineToken,
  };
}
