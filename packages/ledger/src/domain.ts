import type { AccountId } from "@line-work/account/domain";
import type { AssetCode } from "@line-work/asset/domain";

/** Runtime business origins that may request a Ledger credit. */
export type LedgerSource =
  | { context: "membership"; type: "daily_checkin" }
  | { context: "attendance"; type: "clockIn" | "clockOut" };

/**
 * Positive Asset credit requested by an originating business Context.
 * The holder's AccountId is separate from the actor and working relationship.
 * Current runtime sources are reward decisions and retain their V1 origin keys.
 * Privileged migration may preserve legacy_balance facts, but is not a runtime source.
 */
export type LedgerCredit = {
  holderAccountId: AccountId;
  asset: AssetCode;
  source: LedgerSource;
  sourceRef: string;
  businessDay: string;
  amount: number;
  at: number;
};
