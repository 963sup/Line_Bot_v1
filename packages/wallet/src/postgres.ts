import type { AccountId } from "@line_bot_v1/account/domain";
import { readUserQualification } from "@line_bot_v1/account/postgres";
import { assetAmount } from "@line_bot_v1/asset/domain/entities/asset-definition";
import type { AssetCode } from "@line_bot_v1/asset/domain/value-objects/asset-code";
import { readAssetDefinition } from "@line_bot_v1/asset/postgres";
import { sumLedgerUnits } from "@line_bot_v1/ledger/postgres";
import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import type { WalletRepository } from "./contracts/repositories/wallet-repository.js";
import type { WalletBalance } from "./domain/value-objects/wallet-balance.js";

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
