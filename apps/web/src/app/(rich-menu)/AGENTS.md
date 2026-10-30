# Rich Menu route group

繼承 [上層規則](../AGENTS.md)；本檔僅補充當地約束。

`(rich-menu)` owns authenticated LINE Rich Menu navigation composition at the
Web route-group boundary. It maps Rich Menu actions to existing canonical
application surfaces and preserves direct-entry and authentication continuity.

## Boundary

- This route group is parallel to `(mobile)` and does not enter the URL.
- It does not own business truth, authorization, persistence, Attendance,
  Notifications, Repository, Profile, or LINE provider configuration.
- Reuse the existing owner contract and canonical route before adding a new
  destination, adapter, writer, or business abstraction.
- Presentation labels and query parameters express navigation intent only;
  they never authorize or create a new source of truth.
- LINE protocol/client behavior stays with `packages/line`; product definition,
  publication and readback use the existing [Rich Menu operator composition](../../modules/assistant/rich-menu/AGENTS.md).

## Navigation invariants

- Every action resolves to one canonical application surface.
- `/profile` resolves the current authenticated User entry; it must not create
  a second Profile surface or regress to Settings.
- Attendance-backed Time Tracking reuses the Attendance application contract and
  preserves qualification, replay, version, isolation, transaction, and
  recovery semantics.
- Notifications remain recipient-scoped and owner-authoritative.
- Direct entry, refresh, back navigation, and authenticated continuation must
  converge on the same owner semantics.

## Change and validation

Before changing a destination, confirm its canonical URL, business/data owner,
public contract, authorization behavior, direct-entry behavior, and existing
consumer. Do not duplicate an existing resource route.

Run the affected route and owner tests, then applicable `pnpm lint`,
`pnpm typecheck` and `pnpm test`. Use provider readback for actual Rich
Menu publication; local route checks do not prove provider publication.
