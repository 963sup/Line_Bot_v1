import type {
  GoogleLinkConfirmation,
  GoogleLinkOwner,
  GoogleLinkStage,
} from "../../domain/google-link.js";
import type { VerifiedGoogleIdentity } from "./identity-provider.js";
import type { UserTransactions } from "./user-transactions.js";

export interface GoogleLinkTransaction {
  readonly users: UserTransactions;
  owner(provider: string, subject: string): Promise<GoogleLinkOwner | null>;
  expire(userId: string, now: number): Promise<void>;
  token(): string;
  insert(
    request: { userId: string; userVersion: number; expiresAt: number },
    token: string,
  ): Promise<void>;
  stageRequest(token: string, now: number): Promise<GoogleLinkStage | null>;
  saveStage(id: string, google: VerifiedGoogleIdentity): Promise<void>;
  pending(
    userId: string,
    version: number,
    now: number,
  ): Promise<{ id: string; email: string | null; expiresAt: number } | null>;
  confirmation(
    id: string,
    userId: string,
    version: number,
    now: number,
  ): Promise<GoogleLinkConfirmation | null>;
  drop(id: string): Promise<void>;
  cancel(id: string, userId: string): Promise<void>;
  linked(userId: string): Promise<boolean>;
  unlink(userId: string): Promise<void>;
  clear(userId: string): Promise<void>;
  audit(userId: string, event: string, now: number): Promise<void>;
}

export interface GoogleLinkTransactions {
  transact<T>(work: (transaction: GoogleLinkTransaction) => Promise<T>): Promise<T>;
}
