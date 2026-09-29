# Attendance package constraints

Local constraints for `@line_bot_v1/attendance`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Ownership

`packages/attendance` is the single implementation owner for the Attendance capability.

Attendance-owned knowledge belongs in this package: canonical actions and vocabulary, session state and transitions, time/location classification, Repository-address eligibility interpretation, clock reward policy, application use cases, command/query contracts, boundary DTO validation, replay/version/receipt semantics, and Attendance-derived view/menu/notification expectations.

`apps/web` and API routes are host / delivery only. They may own React, HTTP, Request/Response, LIFF, browser lifecycle, geolocation acquisition, storage mechanics, rendering and transport error mapping, but must not maintain a second Attendance action list, labels, state-to-action rule, response schema, retry rule or business projection.

LINE is an external adapter. LINE protocol, provider credentials, Rich Menu transport and message delivery stay outside Attendance; Attendance owns only the semantic intent/result that those adapters consume.

Consumers use `package.json#exports` only. Attendance-specific knowledge must not be recreated under `apps/web/src/shared` or another package.

## Local invariants

- Attendance session state transitions must be monotonic and replay-safe.
- Clock-in location and Repository-address eligibility are verified at command time.
- Clock-out uses the original Attendance address snapshot and does not regain or require new Repository access.
- Same request identity + same command replays the durable receipt; the same identity with different content conflicts.
- Version conflicts never silently overwrite newer state.
- Attendance reward grants emit stable idempotency identity to Ledger.
- Browser/session storage is UX recovery only; durable server state, receipt and version remain authoritative.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported by external consumers.
