import type { AccountId } from "@line_bot_v1/account/domain";
import type { AssetCode } from "@line_bot_v1/asset/domain/value-objects/asset-code";

/** The holder is an Account; this key does not identify the command actor or an Employment. */
type WalletKey = {
  holderAccountId: AccountId;
  asset: AssetCode;
};

export type WalletBalance = WalletKey & {
  units: number;
  balance: number;
};
