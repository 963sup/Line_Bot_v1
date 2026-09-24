import type { DailyCheckInClaim } from "../../domain.js";

type DailyCheckInClaimResult = Readonly<{
  claim: DailyCheckInClaim;
  credited: number;
  replayed: boolean;
}>;

export interface DailyCheckInRepository {
  /** Lock/recheck human qualification and optional auth binding, then commit audit and credit atomically.
   * A repeated human/business-day claim returns the original outcome; failures must roll back all writes.
   */
  claim(
    memberId: string,
    now: number,
    expectedDay: string,
    authId?: string,
  ): Promise<DailyCheckInClaimResult>;
  /** Recovery requires active qualification in the read transaction; account views may show existing claims. */
  read(
    memberId: string,
    day: string,
    qualification: "active" | "any",
  ): Promise<DailyCheckInClaim | null>;
}
