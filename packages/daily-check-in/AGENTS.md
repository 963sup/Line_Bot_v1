# Daily Check-in package constraints

Local constraints for `@line_bot_v1/daily-check-in`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Exactly one check-in claim per user per UTC/timezone business day.
- DailyCheckIn claim retry uses the existing `(user_id, business_day)` natural key: an existing claim replays its persisted result without another Ledger credit. The current claim API has no requestId/fingerprint command; do not invent one.
- Reward distribution triggers atomic credit entries via Ledger/Wallet.
