import { randomInt } from "node:crypto";
import { qualifyActiveUser } from "@line-work/account/adapters/postgres";
import { readAssetDefinition } from "@line-work/asset/adapters/postgres";
import { type AssetDefinition, assetAmount, COIN_ASSET_CODE } from "@line-work/asset/domain";
import { readLedgerCreditFact, recordLedgerCredit } from "@line-work/ledger/adapters/postgres";
import { businessDatabase, type Database, type Sql } from "@line-work/platform/adapters/postgres";
import type { DailyCheckInRepository } from "../application/ports/daily-check-in-repository.js";
import {
  DAILY_CHECK_IN_LEDGER_SOURCE,
  DAILY_CHECK_IN_POLICY,
  type DailyCheckInClaim,
  DailyCheckInError,
  type DailyCheckInPrizeCode,
  dailyCheckInDay,
  selectDailyCheckInPrize,
} from "../domain.js";

export class PostgresDailyCheckInStore implements DailyCheckInRepository {
  constructor(
    private db: Database = businessDatabase(),
    private randomTicket: (exclusiveMax: number) => number = randomInt,
  ) {}

  claim(id: string, now: number, expectedDay: string, authId?: string) {
    return this.db.transaction(async (sql) => {
      await qualifyActiveUser(sql, id, authId);
      const currentDay = dailyCheckInDay(now);
      const existing = await readClaim(sql, id, expectedDay);
      if (existing) {
        await ensureLedgerParity(sql, id, existing);
        return { claim: existing, credited: 0, replayed: true };
      }
      if (await hasLedgerFact(sql, id, expectedDay)) {
        throw new DailyCheckInError(409, "簽到獎勵紀錄不一致，請聯絡管理員。");
      }
      if (expectedDay !== currentDay) {
        throw new DailyCheckInError(409, "簽到日期已變更，請重新整理後再試。");
      }
      const prize = selectDailyCheckInPrize(this.randomTicket(DAILY_CHECK_IN_POLICY.totalWeight));
      const { amountUnits, definition } = await prizeUnits(sql, prize.amount);
      const claim = await insertClaim(
        sql,
        {
          memberId: id,
          day: currentDay,
          prizeCode: prize.code,
          rewardAmountUnits: amountUnits,
          decidedAt: now,
        },
        definition,
      );
      if (!claim) {
        const replayed = await readClaim(sql, id, currentDay);
        if (!replayed) throw new DailyCheckInError(409, "簽到狀態已變更，請重新整理。");
        await ensureLedgerParity(sql, id, replayed);
        return { claim: replayed, credited: 0, replayed: true };
      }
      const credited = await recordLedgerCredit(sql, {
        holderAccountId: id,
        asset: COIN_ASSET_CODE,
        source: DAILY_CHECK_IN_LEDGER_SOURCE,
        sourceRef: currentDay,
        businessDay: currentDay,
        amount: claim.reward,
        at: now,
      });
      if (credited !== claim.reward) {
        throw new DailyCheckInError(409, "簽到獎勵紀錄不一致，請聯絡管理員。");
      }
      return { claim, credited, replayed: false };
    });
  }

  read(id: string, day: string, qualification: "active" | "any") {
    return this.db.transaction(async (sql) => {
      if (qualification === "active") await qualifyActiveUser(sql, id);
      const claim = await readClaim(sql, id, day);
      if (claim) await ensureLedgerParity(sql, id, claim);
      return claim;
    });
  }
}

async function readClaim(
  sql: Sql,
  memberId: string,
  day: string,
): Promise<DailyCheckInClaim | null> {
  const row = (
    await sql.query(
      `SELECT business_day,prize_code,reward_amount_units,policy_version,decided_at
       FROM daily_check_in_claims
       WHERE user_id=$1 AND business_day=$2`,
      [memberId, day],
    )
  ).rows[0] as
    | {
        business_day: string;
        prize_code: DailyCheckInPrizeCode;
        reward_amount_units: number | string;
        policy_version: typeof DAILY_CHECK_IN_POLICY.version;
        decided_at: number | string;
      }
    | undefined;
  if (!row) return null;
  const definition = await readAssetDefinition(sql, COIN_ASSET_CODE);
  if (!definition) throw new DailyCheckInError(503, "簽到獎勵設定暫不可用。");
  return mapClaim(row, definition);
}

async function hasLedgerFact(sql: Sql, memberId: string, day: string) {
  return (
    (await readLedgerCreditFact(
      sql,
      memberId,
      COIN_ASSET_CODE,
      DAILY_CHECK_IN_LEDGER_SOURCE,
      day,
    )) !== null
  );
}

async function ensureLedgerParity(sql: Sql, memberId: string, claim: DailyCheckInClaim) {
  const definition = await readAssetDefinition(sql, COIN_ASSET_CODE);
  if (!definition) throw new DailyCheckInError(503, "簽到獎勵設定暫不可用。");
  const expectedUnits = toAssetUnits(claim.reward, definition.unitsPerWhole);
  const fact = await readLedgerCreditFact(
    sql,
    memberId,
    COIN_ASSET_CODE,
    DAILY_CHECK_IN_LEDGER_SOURCE,
    claim.day,
  );
  if (!fact || fact.businessDay !== claim.day || fact.amountUnits !== expectedUnits) {
    throw new DailyCheckInError(409, "簽到獎勵紀錄不一致，請聯絡管理員。");
  }
}

async function prizeUnits(sql: Sql, reward: number) {
  const definition = await readAssetDefinition(sql, COIN_ASSET_CODE);
  if (!definition) throw new DailyCheckInError(503, "簽到獎勵設定暫不可用。");
  return { amountUnits: toAssetUnits(reward, definition.unitsPerWhole), definition };
}

function toAssetUnits(amount: number, unitsPerWhole: number) {
  const units = amount * unitsPerWhole;
  if (!Number.isSafeInteger(units) || units <= 0) {
    throw new DailyCheckInError(500, "簽到獎勵設定不正確。");
  }
  return units;
}

async function insertClaim(
  sql: Sql,
  claim: {
    memberId: string;
    day: string;
    prizeCode: DailyCheckInPrizeCode;
    rewardAmountUnits: number;
    decidedAt: number;
  },
  definition: AssetDefinition,
): Promise<DailyCheckInClaim | null> {
  const row = (
    await sql.query(
      `INSERT INTO daily_check_in_claims(
         user_id,business_day,prize_code,reward_asset_code,reward_amount_units,policy_version,decided_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id,business_day) DO NOTHING
       RETURNING business_day,prize_code,reward_amount_units,policy_version,decided_at`,
      [
        claim.memberId,
        claim.day,
        claim.prizeCode,
        COIN_ASSET_CODE,
        claim.rewardAmountUnits,
        DAILY_CHECK_IN_POLICY.version,
        claim.decidedAt,
      ],
    )
  ).rows[0] as
    | {
        business_day: string;
        prize_code: DailyCheckInPrizeCode;
        reward_amount_units: number | string;
        policy_version: typeof DAILY_CHECK_IN_POLICY.version;
        decided_at: number | string;
      }
    | undefined;
  return row ? mapClaim(row, definition) : null;
}

function mapClaim(
  row: {
    business_day: string;
    prize_code: DailyCheckInPrizeCode;
    reward_amount_units: number | string;
    policy_version: typeof DAILY_CHECK_IN_POLICY.version;
    decided_at: number | string;
  },
  definition: AssetDefinition,
): DailyCheckInClaim {
  return {
    day: row.business_day,
    prizeCode: row.prize_code,
    reward: assetAmount(definition, Number(row.reward_amount_units)),
    policyVersion: row.policy_version,
    decidedAt: Number(row.decided_at),
  };
}
