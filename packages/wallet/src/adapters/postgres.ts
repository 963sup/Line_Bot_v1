import { readUserQualification } from "@line_bot_v1/account/adapters/postgres";
import type { AccountId } from "@line_bot_v1/account/domain";
import { readAssetDefinition } from "@line_bot_v1/asset/adapters/postgres";
import { type AssetCode, assetAmount } from "@line_bot_v1/asset/domain";
import { sumLedgerUnits } from "@line_bot_v1/ledger/adapters/postgres";
import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import type { WalletRepository } from "@line_bot_v1/wallet/application/ports/wallet-repository";
import type { WalletBalance } from "@line_bot_v1/wallet/domain";

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
