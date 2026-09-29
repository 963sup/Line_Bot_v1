# Attendance package

Routing and module overview for `@line_bot_v1/attendance`.

- Semantic owner: `attendance`
- Authority document: [`docs/owners/attendance.md`](../../docs/owners/attendance.md)
- Machine boundaries: [`architecture/implementation-topology.json`](../../architecture/implementation-topology.json)
- Persistence mapping: [`architecture/data-topology.json`](../../architecture/data-topology.json)

## Responsibility

This package is the single implementation owner for the Attendance capability.

It owns Attendance actions and vocabulary, session lifecycle, clock-in / clock-out rules, time/location classification, Repository-address eligibility interpretation, reward policy, application orchestration, public command/query/result contracts, replay/version/receipt semantics, and Attendance-derived read/menu/notification expectations.

Current clock points are Repository address properties. Legacy Workplace relations are retained persistence history only and are not a second runtime Attendance owner.

## Boundaries

- `apps/web`: host / delivery only — React, LIFF, browser APIs, HTTP transport and rendering.
- API routes: host / delivery only — Request/Response parsing, authentication context and transport mapping.
- LINE: external adapter — Rich Menu/message/provider protocol and delivery.
- `packages/attendance`: all Attendance-specific semantic and application knowledge consumed by those hosts/adapters.

Cross-boundary consumers must use exact `package.json#exports`; they must not recreate Attendance action lists, labels, state interpretation, DTO validation or retry semantics.
