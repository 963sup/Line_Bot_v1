export interface DailyCheckInRepository {
  /** Lock/recheck human qualification and optional auth binding, then commit audit and credit atomically.
   * A repeated human/business-day claim returns 0; failures must roll back all writes.
   */
  claim(memberId: string, now: number, authId?: string): Promise<number>;
}
