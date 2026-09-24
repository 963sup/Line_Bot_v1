import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type {
  IdentityProvider,
  VerifiedGoogleIdentity,
} from "../application/ports/identity-provider.js";
import { UserError } from "../domain/user.js";

export type GoogleUser = VerifiedGoogleIdentity;
export function googleUser(user: User): GoogleUser {
  const identity = user.identities?.find((i) => i.provider === "google");
  if (!identity?.id || !user.email_confirmed_at || !user.email || user.is_anonymous) {
    throw new UserError(403, "請使用已驗證的 Google 帳號登入。");
  }
  return { id: user.id, sub: identity.id, email: user.email };
}

export class SupabaseIdentity implements IdentityProvider {
  private publicClient?: SupabaseClient;
  private client() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new UserError(503, "Supabase 身分服務尚未設定。");
    const create = () =>
      createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    return (this.publicClient ??= create());
  }
  async verify(token: string) {
    const { data, error } = await this.client().auth.getUser(token);
    if (error || !data.user) throw new UserError(401, "登入已過期，請重新登入 Google。");
    return googleUser(data.user);
  }
}

let identity: SupabaseIdentity | undefined;
export function supabaseIdentity() {
  return (identity ??= new SupabaseIdentity());
}
