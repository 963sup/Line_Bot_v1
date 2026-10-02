# Issue

Read this file for Issue ownership and invariants.

## Responsibility

Issue owns:

- stable Issue identity within a Repository and the consumed repository-scoped Issue number;
- canonical FPT `IssueState = OPEN | CLOSED` and nullable `IssueStateReason`;
- publisher, title, body, current 0..N assignee relation and local acceptance criteria;
- the separate local `pending / active / review / completed` work workflow;
- replay-safe Issue commands, aggregate version and immutable structured Issue event history;
- Issue → Repository Label association facts.
- Organization-scoped `IssueType` definitions and the optional Issue → IssueType association fact.

Repository remains authoritative for Repository identity, current visibility/access, participant scope, Label/Milestone definitions and allocation of the next repository-scoped Issue number. Project may reference Issue but cannot rewrite Issue state.

## Invariants

- Every Issue belongs to exactly one Repository. Issue number is unique only within that Repository.
- Read visibility and write authority are separate. PUBLIC/INTERNAL Repository visibility may make Issue content readable; every Issue command still requires current explicit RepositoryPermission and the operation matrix below.
- Issue creation adopts FPT `schema-issues.json#IssueCreationPolicy = COLLABORATORS_ONLY`: every exact RepositoryPermission may open an unassigned Issue.
- Adding assignees, including during create, is a separate generic assignment operation and therefore requires `triage | triage_plus | write | maintain | admin`.
- Assignees are a current Issue-owned collection. The collection may be empty or contain multiple current collaborators. Author self-assignment is valid; the old `publisher <> assignee` rule is not an FPT invariant.
- Local `accept / report / reject / approve` is not FPT IssueState. Accept/report may be performed by any current assignee; reject/approve by the publisher. The Issue must be OPEN. Approve moves only the local workflow to `completed`; closing is an explicit separate command.
- Generic content edit, close/reopen and assignment follow the #152 operation matrix and require `triage | triage_plus | write | maintain | admin`.
- `stateReason` is nullable. OPEN permits `null | REOPENED`; CLOSED permits `null | COMPLETED | DUPLICATE | NOT_PLANNED`. Reopen writes `REOPENED`; close accepts only a closed-state reason or null.
- General `body` and local acceptance `criteria` are distinct. Local product limits are title 80 characters, body 10,000 characters and criteria 1,000 characters; those limits are Line_Bot_v1 policy, not FPT truth.
- Every conditional mutation requires Issue `expectedVersion`, stable request identity and exact replay. One committed mutation increments the Issue aggregate version once and appends one immutable event at the same version.
- Event `data` stores the command-time structured delta for state, assignment, workflow and content changes. Historical events are not reconstructed from the current snapshot.
- Archived Repository content remains readable under current visibility, but all new Issue mutations fail closed.
- Project references do not transfer Issue authority.
- IssueType definition scope is a stable Organization identity. Create/update/delete requires current active `OrganizationOwner`; Repository or Issue roles do not grant type-definition authority.
- Assign/clear IssueType is an Issue classification mutation using current Repository triage authority. The target type must belong to the Organization that owns the Issue Repository; User-owned Repositories have no Organization IssueType scope.
- IssueType is independent from permission, `OPEN/CLOSED`, `stateReason` and local workflow. Assigning a type changes only the Issue aggregate version and type relation/history.
- `isEnabled=false` blocks only new assignment; existing assignments stay readable. Delete is a soft tombstone, is forbidden while any current Issue references the type, and deleted definitions cannot be revived.
- Type-definition history is immutable in `issue_type_events`; Issue add/change/remove type history is recorded in `issue_events` as `issue_type_added | issue_type_changed | issue_type_removed` timeline evidence.

## Repository operation matrix

The permission matrix follows the exact FPT `schema-repos.json#RepositoryPermission` descriptions without imposing a synthetic rank.

| Operation | Accepted RepositoryPermission | Current runtime |
| --- | --- | --- |
| read | read, triage, triage_plus, write, maintain, admin | Implemented through current Repository visibility/access |
| open | read, triage, triage_plus, write, maintain, admin | Implemented; creation policy is collaborators-only |
| comment | read, triage, triage_plus, write, maintain, admin | Implemented through manage-issue-collaboration; lock state is checked separately |
| local workflow | read, triage, triage_plus, write, maintain, admin | Implemented; publisher/current-assignee responsibility is checked separately |
| triage | triage, triage_plus, write, maintain, admin | Implemented for IssueType, Label/Milestone classification and typed Issue relations |
| edit | triage, triage_plus, write, maintain, admin | Implemented for title/body/local criteria |
| close | triage, triage_plus, write, maintain, admin | Implemented for close/reopen + stateReason |
| assign | triage, triage_plus, write, maintain, admin | Implemented for add/remove assignees |
| manage-resource | none in Issue | Repository Label/Milestone definition management remains Repository-owned |
| lock-conversation | write, maintain, admin | Implemented; lock/unlock is independent from Issue OPEN/CLOSED state |

The matrix classifies permission only. Actor qualification/current access, Repository archive state, the collaborators-only creation policy, and local workflow responsibility are evaluated separately. Visibility-only readers get no synthetic RepositoryPermission and therefore cannot mutate Issues.

## Existing-data mapping strategy

The current schema is an expand-compatible rollout, not a destructive contract cutover. Pre-parity physical `assignee` / `status` columns remain nullable compatibility storage until a separately authorized data cutover proves no legacy rows remain. New Issue INSERTs cannot write those columns.

Runtime mapping does not invent facts that did not exist before parity:

- old `pending | active | review | completed` maps only to the same local `workflowStatus`;
- every pre-parity row is presented as canonical `state=OPEN`, `stateReason=null` until an explicit close command occurs; local `completed` is not retroactively reinterpreted as an FPT close event;
- the old single `assignee` is presented as the current one-element assignee collection; its historical assignment time is unknown and remains `NULL` if materialized;
- old `criteria` remains local criteria; pre-parity `body` is the empty string because no historical general body fact existed;
- old immutable events remain immutable and retain empty structured `data` when that field did not exist; no state reason, body or assignment timestamp is reconstructed.

On the first business mutation of a legacy row, the same transaction locks the Issue, materializes the exact legacy assignee into `issue_assignees`, populates canonical state/body/workflow fields, clears the compatibility columns, applies the requested business mutation, increments the aggregate version exactly once and appends exactly one event for that business mutation. The technical representation change is not presented as a historical business event.

Physical removal of the legacy columns is a later contract stage and is forbidden until the pending Issue core cutover has provider recovery evidence plus a readback proving zero legacy rows. See [Issue core parity cutover](../change/migrations/issue-core-parity.md).

## IssueType parity

FPT `schema-issues.json#IssueType` is implemented inside the Issue owner; FPT category does not create a package boundary.

- `IssueTypeColor` accepts exactly `BLUE | GRAY | GREEN | ORANGE | PINK | PURPLE | RED | YELLOW`.
- Type identity is server-generated and stable. Name (1–120) and optional description (≤2000) are Line_Bot_v1 storage/input limits, not GitHub FPT semantics.
- Definitions are Organization-scoped and listable/manageable only by a current active `OrganizationOwner`. Assignment is separate and follows Repository triage authority.
- Existing disabled assignments remain explainable/readable. A disabled or tombstoned type cannot be newly assigned.
- Tombstones retain definition/event history; deletion requires zero current assignments. No historical type relation is reconstructed from the current row.
- `IssueType.pinnedFields` belongs to the separate IssueField capability and is not fabricated by this parity slice.
- Activation is atomic: `627_issue_types.sql`, cross-owner scope enforcement, semantic/data topology, package contracts, HTTP delivery and integration tests must coexist at the same revision. There is no separate adoption ledger or partial runtime flag.

## Mapping

Runtime owner: `packages/issue`. Repository scope provider: `packages/repository`. Web presentation remains on Repository resource routes without acquiring Issue authority.

Persisted relation ownership is authoritative in [data topology](../../architecture/data-topology.json); SQL definitions remain under `supabase/schemas/`.

Adjacent owners: [Repository](repository.md) · [Project](project.md) · [Notifications](notifications.md)


## Collaboration parity

Issue collaboration is current runtime authority through `manage-issue-collaboration`.

- `IssueComment` has stable identity, author, body, version, edit/delete-retain lifecycle, and is never reconstructed from `issue_events`.
- Issue owns Label association facts and Milestone assignment; Repository continues to own Label/Milestone definitions and same-Repository validity is enforced on every write.
- `parent/subIssues`, `blockedBy/blocking`, and `relatesTo` are distinct persisted relations. Parent and dependency graphs reject self/cycles; `relatesTo` is symmetric and canonicalized.
- Cross-Repository relation mutations recheck both endpoints' current Repository access. `relatesTo` additionally requires the caller's observed version for both endpoints, serializes the symmetric graph mutation, advances both Issue versions atomically and records mirrored immutable events. Read projections omit inaccessible relation endpoints rather than leaking hidden titles or counts.
- Conversation lock is independent of OPEN/CLOSED state. Lock/unlock requires Repository write/maintain/admin; a locked conversation allows comments only from those same privileged collaborators.
- Every mutation requires `expectedVersion` plus a request UUID and stores an exact replay receipt in the same transaction. Single-endpoint mutations advance that Issue exactly once; symmetric `relatesTo` mutations advance each affected endpoint exactly once using both expected versions.
