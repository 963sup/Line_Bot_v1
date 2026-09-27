# Web DailyCheckIn module

## Owner

This module owns the DailyCheckIn Web presentation lifecycle: current-view loading, explicit claim intent, unknown-result readback, wheel/result presentation, reduced-motion and mobile interaction states.

Business-day/reward policy, qualification recheck and atomic claim remain in `@line-work/daily-check-in`. Account only supplies User qualification; Wallet/Ledger remain their own owners.

## Boundary

- Current surface: `/daily-check-in`.
- Existing `/api/membership` check-in/readback wire contract is retained as durable protocol; this module consumes it without creating a second DailyCheckIn endpoint or truth.
- Settings uses `/api/membership?view=account` and must not load DailyCheckIn/Wallet projection.
- Provider profile, UI animation and browser state never determine reward, actor, day or credit.
- Unknown result preserves the original business day and reads back before any explicit retry.

## Validation

Keep server/domain replay tests and `scripts/browser/check-membership.mjs` aligned with this surface. Browser evidence must cover committed-result recovery, uncommitted retry, rejected result, reduced motion and 320/390px layout.
