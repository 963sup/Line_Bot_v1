import type { AccountId } from "@line-work/account/domain";
import type { AssetCode } from "@line-work/asset/domain";
import type { WalletBalance } from "../../domain.js";

export interface WalletRepository {
  balance(holderAccountId: AccountId, asset: AssetCode): Promise<WalletBalance>;
}
