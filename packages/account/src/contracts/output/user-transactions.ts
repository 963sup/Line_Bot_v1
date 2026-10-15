import type { User } from "../../domain/user.js";
import type { UserView } from "../input/user.js";
import type { VerifiedGoogleIdentity } from "./identity-provider.js";

type UserIdentityFact = { user: User; authUserId: string | null };
export interface UserTransaction {
  lineUser(provider: string, subject: string): Promise<UserIdentityFact | null>;
  user(id: string): Promise<User>;
  qualify(id: string, authId?: string): Promise<User>;
  protectAdministrator(id: string): Promise<void>;
  newId(): string;
  insert(user: User): Promise<void>;
  saveStatus(user: User): Promise<void>;
  login(id: string): Promise<string | null>;
  claimLogin(id: string, login: string, now: number): Promise<void>;
  renameLogin(id: string, expectedLogin: string, login: string, now: number): Promise<void>;
  recordLineIdentity(id: string, provider: string, subject: string): Promise<void>;
  googleSubject(id: string): Promise<string | null>;
  googleOwner(subject: string): Promise<string | null>;
  saveGoogleBinding(user: User, identity: VerifiedGoogleIdentity): Promise<void>;
  audit(id: string, event: string, now: number): Promise<void>;
  view(id: string): Promise<UserView>;
}

export interface UserTransactions {
  binding<T>(
    provider: string,
    subject: string,
    work: (transaction: UserTransaction) => Promise<T>,
  ): Promise<T>;
  identity<T>(
    provider: string,
    subject: string,
    work: (transaction: UserTransaction) => Promise<T>,
  ): Promise<T>;
  lifecycle<T>(work: (transaction: UserTransaction) => Promise<T>): Promise<T>;
  rename<T>(work: (transaction: UserTransaction) => Promise<T>): Promise<T>;
}
