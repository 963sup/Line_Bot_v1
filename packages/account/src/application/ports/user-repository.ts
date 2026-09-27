import type { User } from "../../domain/user.js";
import type { VerifiedGoogleIdentity } from "./identity-provider.js";

type UserView = User & {
  login: string | null;
  googleEmail: string | null;
};

type PublicUser = Readonly<{
  id: string;
  login: string;
}>;

export interface UserRepository {
  find(provider: string, subject: string): Promise<User | null>;
  view(userId: string): Promise<UserView>;
  publicByLogin(login: string): Promise<PublicUser | null>;
  updateLogin(userId: string, login: string, now: number): Promise<UserView>;
  registerLine(provider: string, subject: string, login: string): Promise<UserView>;
  restoreLine(provider: string, subject: string): Promise<UserView>;
  bind(provider: string, subject: string, google: VerifiedGoogleIdentity): Promise<User>;
  pause(userId: string): Promise<UserView>;
}

type GoogleLinkRequest = { id: string; email: string | null; expiresAt: number };
export interface GoogleLinkRepository {
  start(provider: string, subject: string, now: number): Promise<{ token: string }>;
  stage(token: string, google: VerifiedGoogleIdentity, now: number): Promise<void>;
  pending(provider: string, subject: string, now: number): Promise<GoogleLinkRequest | null>;
  confirm(provider: string, subject: string, id: string, now: number): Promise<void>;
  cancel(provider: string, subject: string, id: string): Promise<void>;
  unlink(provider: string, subject: string, now: number): Promise<void>;
}
