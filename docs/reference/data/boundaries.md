# Data boundary model

Current persisted business truth is defined by three owners:

```text
architecture/semantic-model.json
  → business concept / semantic owner

architecture/data-topology.json
  → persisted relation authority / role / physical file

supabase/schemas/*.sql
  → actual PostgreSQL definition
```

This document explains the cross-owner data invariants only. Physical object inventory belongs to
[Data topology](../../architecture/data-topology.json) and the
[Schema tree](../../supabase/schemas/README.md).

## Account identity

`accounts(id, kind, created_at)` is the global identity root. `users` is the User lifecycle/qualification facet using the same stable ID; it is not a second identity namespace.

```text
Account
├─ User
├─ Organization
└─ Enterprise
```

Root/facet integrity is transactional. Existing IDs are not re-keyed for naming uniformity. External LINE/Google identities only map trusted provider subjects to the same UserId; provider session or email never becomes product authority.

Human identity, command actor, holder, Organization scope and Employment are separate semantics even when they carry the same AccountId value.

## Owner boundaries

- Enterprise, Organization, Team, Repository, Project, Attendance, Expense, Notifications, Partner Directory, Asset, Ledger and Identity/Access each own their persisted facts according to Data Topology.
- Cross-owner references do not transfer authority.
- Runtime adapters access another owner's authoritative facts through that owner's public transaction-scoped contract, an explicit derived projection, or an explicit transaction coordinator.
- `900_cross_owner_projections.sql` is rebuildable read data only.
- `910_cross_owner_constraints.sql` enforces invariants spanning owners.
- `920_transaction_coordinators.sql` owns only required atomic coordination.
- `930_access_enforcement.sql` owns RLS/grant/executable enforcement.
- These mechanism files never become a business truth owner.

Shared PostgreSQL schema/transaction does not merge Bounded Contexts or Module Boundaries.

## Historical facts and projections

| Role | Meaning |
| --- | --- |
| Current state | mutable owner state + version |
| Event/history | immutable evidence of what occurred |
| Command receipt | request identity, fingerprint and durable result |
| Ledger | append-only value facts |
| Projection | rebuildable read model without write authority |
| Outbox | durable expectation after business commit |

Lifecycle changes must not erase historical Attendance, Payroll, Issue, Expense, Ledger or audit references. Unknown provenance stays unresolved instead of being guessed from current Team, Workplace or Organization membership.

## Asset / Wallet / Ledger

```text
AccountId + Asset definition + Ledger facts
                 ↓
WalletBalance(holderAccountId, asset, units, balance)
```

Asset owns denomination; Ledger owns append-only posting facts; Wallet is a derived projection and has no authoritative balance table. Current Coin holding remains USER-only. Historical holder identity is not erased by User pause/restore.

The retained Ledger `member_id` name is storage compatibility only; it does not create a second Member identity or authorize posting.

## Scope, time and authorization

Account/User, Enterprise, Organization, Team, Repository, Workplace, Project and Employment are different scopes. Equal string IDs, URL locators, LINE groups or cached relationships do not grant access.

Server time points use UTC epoch. Business-day timezone is owner-specific; current DailyCheckIn/Attendance reward day remains Asia/Taipei. Authoritative numeric value uses integer units rather than binary floating point.

RLS/grants are defense in depth. Runtime roles do not gain DDL, schema ownership, migration authority, BYPASSRLS or unrestricted cross-owner mutation.

## Current vs target vs remote

Repository schemas describe desired current application structure. They do not prove a remote Supabase project, Vercel deployment or LINE device is synchronized.

Current source includes Account/User, Enterprise/Organization/Team governance, Repository/Issue/Discussion, Project data authority, Attendance/Workplace, value facts, Expense, Notifications and Partner Directory. Workforce module ownership exists, but Employment/Calendar/Schedule runtime remains selected target; formal Payroll flow also remains gated.

Target design and cutover sequencing live in
[Governance](../090-governance/README.md). Dated remote evidence stays in
[Acceptance evidence](../090-governance/060-acceptance/010-acceptance-evidence.md) and never becomes current truth.
