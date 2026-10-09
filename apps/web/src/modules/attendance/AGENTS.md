# Web attendance delivery

## Boundary

URLs：`/attendance`、`/attendance/clock-in`、`/attendance/clock-out`；API 為 `/api/attendance`、其 clock-in/clock-out 子路徑、`/api/attendance/supplements`、`/api/attendance/supplements/review`、`/api/internal/attendance-maintenance`。

`@line_bot_v1/attendance` is the sole Attendance implementation owner. This Web module owns only React/UI rendering, LIFF/browser lifecycle, geolocation acquisition, session-storage mechanics and HTTP transport.

Do not define Attendance actions, operation labels, state-to-action rules, command/result schemas, replay/version rules or notification semantics here. Consume them from exact `@line_bot_v1/attendance` public exports.

Repository address is the current clock point source; clock-out retains the original Attendance address snapshot. Employment cutover follows canonical migration gates; target design never overrides the current subject contract.

- UI state cannot authorize or confirm Attendance success.
- Browser storage supports unknown-result UX only; durable receipt/version/state stay server-authoritative.
- Keep rejected, unavailable, replay/conflict and unknown-result presentation states distinguishable.
- Supplement input and review DTOs, request states and replay contracts must come from `@line_bot_v1/attendance`; the UI never creates authoritative sessions or decides who may review.
- Show that supplement times are User claims for human review, not historical GPS-verified facts. Approval may only append a closed session or close the User's own open session.
- Request/Response, React, LIFF and browser APIs remain host delivery and must not be moved into the domain package.
