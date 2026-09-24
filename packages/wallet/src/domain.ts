import type { AccountId } from "@line-work/account/domain";
import type { AssetCode } from "@line-work/asset/domain";

/** The holder is an Account; this key does not identify the command actor or an Employment. */
export type WalletKey = {
  holderAccountId: AccountId;
  asset: AssetCode;
};

export type WalletBalance = WalletKey & {
  units: number;
  balance: number;
};
