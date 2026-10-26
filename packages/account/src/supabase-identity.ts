import { getUserByAccessToken } from "@line_bot_v1/integration-supabase/auth";
import type { IdentityProvider } from "./contracts/output/identity-provider.js";
import { UserError } from "./domain/user.js";

type AuthenticatedUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  is_anonymous?: boolean;
  identities?: Array<{ provider?: string; id?: string }>;
};

function googleUser(user: AuthenticatedUser) {
  const identity = user.identities?.find((i) => i.provider === "google");
  if (!identity?.id || !user.email_confirmed_at || !user.email || user.is_anonymous) {
    throw new UserError(403, "請使用已驗證的 Google 帳號登入。");
  }
  return { id: user.id, sub: identity.id, email: user.email };
}

class SupabaseIdentity implements IdentityProvider {
  private config() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new UserError(503, "Supabase 身分服務尚未設定。");
    return { url, publishableKey: key };
  }
  async verify(token: string) {
    try {
      const user = await getUserByAccessToken(this.config(), token);
      if (!user) throw new Error("missing user");
      return googleUser(user);
    } catch {
      throw new UserError(401, "登入已過期，請重新登入 Google。");
    }
  }
}

let identity: SupabaseIdentity | undefined;
export function supabaseIdentity() {
  return (identity ??= new SupabaseIdentity());
}
