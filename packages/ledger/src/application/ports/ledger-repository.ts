import type { AccountId } from "@line-work/account/domain";
import type { AssetCode } from "@line-work/asset/domain";
import type { LedgerSource } from "../../domain.js";

export interface LedgerRepository {
  hasEntry(
    holderAccountId: AccountId,
    asset: AssetCode,
    source: LedgerSource,
    sourceRef: string,
  ): Promise<boolean>;
}
