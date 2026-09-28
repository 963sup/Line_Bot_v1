import type { AccountId } from "@line_bot_v1/account/domain";
import type { AssetCode } from "@line_bot_v1/asset/domain";
import type { WalletBalance } from "../../domain.js";

export interface WalletRepository {
  balance(holderAccountId: AccountId, asset: AssetCode): Promise<WalletBalance>;
}
