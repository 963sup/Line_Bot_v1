import { readUserQualification } from "@line-work/account/adapters/postgres";
import type { AccountId } from "@line-work/account/domain";
import { readAssetDefinition } from "@line-work/asset/adapters/postgres";
import { type AssetCode, assetAmount } from "@line-work/asset/domain";
import { sumLedgerUnits } from "@line-work/ledger/adapters/postgres";
import { businessDatabase, type Database } from "@line-work/platform/adapters/postgres";
import type { WalletRepository } from "@line-work/wallet/application/ports/wallet-repository";
import type { WalletBalance } from "@line-work/wallet/domain";

export class PostgresWalletStore implements WalletRepository {
  constructor(private db: Database = businessDatabase()) {}

  balance(holderAccountId: AccountId, asset: AssetCode): Promise<WalletBalance> {
    return this.db.transaction(async (sql) => {
      if (!(await readUserQualification(sql, holderAccountId))) throw new Error("wallet_not_found");
      const definition = await readAssetDefinition(sql, asset);
      if (!definition) throw new Error("wallet_not_found");
      const units = await sumLedgerUnits(sql, holderAccountId, asset);
      return {
        holderAccountId,
        asset,
        units,
        balance: assetAmount(definition, units),
      };
    });
  }
}
