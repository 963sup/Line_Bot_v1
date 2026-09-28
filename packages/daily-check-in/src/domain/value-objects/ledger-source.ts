/**
 * Published origin identity for the existing Ledger V1 protocol.
 * The legacy "membership" literal is preserved for history/idempotency compatibility;
 * it does not make Membership a current Domain owner.
 */
export const DAILY_CHECK_IN_LEDGER_SOURCE = {
  context: "membership",
  type: "daily_checkin",
} as const;
