# Rich Menu route group

## Owner

`(rich-menu)` owns the authenticated LINE Rich Menu entry composition inside the Mobile / LINE MINI App delivery boundary.

It owns only Rich Menu-facing navigation semantics, route composition, direct-entry continuity, and presentation mapping from Rich Menu actions to canonical application surfaces.

It does not own business truth, authorization, persistence, Time Tracking rules, Notifications, collaboration data, analytics facts, or LINE Rich Menu publication/configuration.

## Boundary

```text
LINE Rich Menu
↓
(rich-menu) delivery / navigation composition
↓
canonical application surface
↓
owning module / package
```

The route group does not enter the URL and does not create a second canonical URL for an existing capability.

LINE provider definition, publication, rollback, and readback remain owned by `packages/line-channel` and repository LINE operations. This route group only owns the web delivery destinations reached from Rich Menu.

## Navigation contract

The Rich Menu information architecture is:

```text
Top row
數據洞察｜異常事件｜工作台｜協作空間｜訊息中心

Center entry
工時紀錄（Time Tracking）
```

### Top row

| Label | Responsibility |
| --- | --- |
| 數據洞察 | Read-only insight / measurement entry. Do not fabricate analytics truth from unrelated projections. |
| 異常事件 | Exception/anomaly entry. The owning business context remains authoritative for each anomaly. |
| 工作台 | Cross-owner work composition; presentation only, not a new Workbench Domain. |
| 協作空間 | Collaboration entry across existing owner capabilities; do not create a Collaboration Domain merely for navigation. |
| 訊息中心 | Presentation entry to Notifications-owned recipient projection; do not create Inbox/MessageCenter persistence. |

### Center entry

| Label | Responsibility |
| --- | --- |
| 工時紀錄（Time Tracking） | Time Tracking capability entry. The Rich Menu navigates to the canonical Time Tracking surface; clock-in and clock-out remain Time Tracking-owned commands inside that surface. |

## Invariants

- Route Group does not enter the URL and does not authorize.
- Every Rich Menu destination must resolve to one canonical URL owner.
- Navigation labels are presentation vocabulary; they do not imply a new package, schema, bounded context, or source of truth.
- Existing owner contracts must be reused before adding a route or adapter.
- `工時紀錄（Time Tracking）` is the Rich Menu navigation label for the Time Tracking capability. Clock-in and clock-out remain distinct Time Tracking commands and must not bypass its application contracts or weaken qualification, replay/idempotency, version, tenant isolation, transaction, or recovery semantics.
- Notifications remain authoritative for recipient-scoped message state even when the UI label is `訊息中心`.
- Data insight and anomaly surfaces must remain read projections unless a real command responsibility is explicitly owned elsewhere.
- Direct entry from LINE, refresh, back, and authenticated continuation must converge on the same authoritative application semantics.
- Do not use query parameters or client navigation state as authorization evidence.
- Do not duplicate LINE Rich Menu provider configuration in this directory.

## Change rules

Before adding a concrete `page.tsx`, resolve:

1. the canonical URL;
2. the business/data owner;
3. the existing public contract;
4. authorization and direct-entry behavior;
5. whether the destination already exists elsewhere.

If an existing canonical route already owns the destination, link/redirect to it rather than creating a parallel implementation.

## Validation

Use repository canonical validation:

- normal change: `pnpm check`
- full validation / merge: `pnpm validate`
- documentation-only change: `pnpm docs:check`

For Rich Menu publication or external LINE verification, use the repository's canonical LINE operation and provider readback; local route validation is not publication evidence.
