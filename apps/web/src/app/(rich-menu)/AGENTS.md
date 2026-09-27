# Rich Menu route group

## Owner

`(rich-menu)` owns the authenticated LINE Rich Menu entry composition at the app route-group boundary.

It owns Rich Menu-facing navigation semantics, route composition, direct-entry continuity, and presentation mapping from Rich Menu actions to canonical application surfaces.

It does not own business truth, authorization, persistence, Attendance rules, Notifications, Repository state, Profile identity, or LINE Rich Menu publication/configuration.

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

The route group is parallel to `(mobile)`; it is not owned by the Mobile shell. Route Groups do not enter the URL and do not create a second canonical URL for an existing capability.

LINE provider definition, publication, rollback, and readback remain owned by `packages/line-channel` and repository LINE operations. This route group owns only the Web delivery destinations reached from Rich Menu.

## Current navigation contract

The current outer ring is:

```text
Repositories
Incident
Forms
Team
Profile
Notifications
```

The center entry remains Attendance-backed Time Tracking:

```text
Time Tracking
├─ Start
└─ Stop
```

| Rich Menu label | Canonical destination / responsibility |
| --- | --- |
| 儲存庫 | `/repositories`; Repository-owned collection |
| 異常通報 | incident Rich Menu submenu; external form entries remain navigation only |
| 表單作業 | forms submenu; external forms do not create local business truth |
| 團隊協作 | team submenu backed by existing Team/Partner destinations |
| 個人 | `/profile`; authenticated viewer Profile hub. `/{login}` remains the canonical User/Organization locator |
| 通知中心 | Notifications-owned recipient projection |
| 開始工作 / 結束工作 | current Attendance application contract |

Legacy `membership=1` remains a compatibility entry to `/settings`; current Rich Menu personal navigation uses the distinct `profile=1` intent and must not regress back to Settings.

## Invariants

- Route Group does not enter the URL and does not authorize.
- `(rich-menu)` is a sibling of `(mobile)`, not a nested Mobile route group.
- Every Rich Menu destination resolves to one canonical application surface.
- Navigation labels are presentation vocabulary; they do not imply a new package, schema, Bounded Context, or source of truth.
- Existing owner contracts are reused before adding a route or adapter.
- `/profile` is a viewer composition, not a second User identity. Share/public identity remains `/{login}`.
- Time Tracking presentation commands still reuse Attendance application contracts and preserve qualification, replay/idempotency, version, tenant isolation, transaction, and recovery semantics.
- Notifications remain authoritative for recipient-scoped message state even when the UI label is 通知中心.
- Direct entry from LINE, refresh, back, and authenticated continuation converge on the same authoritative application semantics.
- Query parameters and client navigation state never authorize.
- Rich Menu provider configuration is not duplicated in this directory.

## Change rules

Before adding a concrete destination, resolve:

1. canonical URL or viewer composition surface;
2. business/data owner;
3. existing public contract;
4. authorization and direct-entry behavior;
5. whether the destination already exists elsewhere.

If an existing canonical resource route already owns the destination, link to it rather than creating a parallel business implementation.

## Validation

Use repository canonical validation:

- normal change: `pnpm check`
- full validation / merge: `pnpm validate`
- documentation-only change: `pnpm docs:check`

For Rich Menu publication or external LINE verification, use the repository canonical LINE operation and provider readback; local route validation is not publication evidence.
