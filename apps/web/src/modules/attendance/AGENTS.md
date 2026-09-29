# Web attendance delivery

## Boundary

URLs：`/attendance`、`/attendance/clock-in`、`/attendance/clock-out`；API 為 `/api/attendance`、其 clock-in/clock-out 子路徑、`/api/internal/attendance-maintenance`。

`@line_bot_v1/attendance` is the sole Attendance implementation owner. This Web module owns only React/UI rendering, LIFF/browser lifecycle, geolocation acquisition, session-storage mechanics and HTTP transport.

Do not define Attendance actions, operation labels, state-to-action rules, command/result schemas, replay/version rules or notification semantics here. Consume them from exact `@line_bot_v1/attendance` public exports.

Repository address is the current clock point source; clock-out retains the original Attendance address snapshot. Employment cutover follows canonical migration gates; target design never overrides the current subject contract.

- UI state cannot authorize or confirm Attendance success.
- Browser storage supports unknown-result UX only; durable receipt/version/state stay server-authoritative.
- Keep rejected, unavailable, replay/conflict and unknown-result presentation states distinguishable.
- Request/Response, React, LIFF and browser APIs remain host delivery and must not be moved into the domain package.
