import { qualifyActiveUser } from "@line-work/account/adapters/postgres";
import { COIN_ASSET_CODE } from "@line-work/asset/domain";
import { recordLedgerCredit } from "@line-work/ledger/adapters/postgres";
import { businessDatabase, type Database } from "@line-work/platform/adapters/postgres";
import type { DailyCheckInRepository } from "../application/ports/daily-check-in-repository.js";
import { DAILY_CHECK_IN_COIN_REWARD, dailyCheckInDay } from "../domain.js";

export class PostgresDailyCheckInStore implements DailyCheckInRepository {
  constructor(private db: Database = businessDatabase()) {}

  claim(id: string, now: number, authId?: string) {
    return this.db.transaction(async (sql) => {
      await qualifyActiveUser(sql, id, authId);
      const day = dailyCheckInDay(now);
      const credited = await recordLedgerCredit(sql, {
        holderAccountId: id,
        asset: COIN_ASSET_CODE,
        source: { context: "membership", type: "daily_checkin" },
        sourceRef: day,
        businessDay: day,
        amount: DAILY_CHECK_IN_COIN_REWARD,
        at: now,
      });
      return credited;
    });
  }
}
