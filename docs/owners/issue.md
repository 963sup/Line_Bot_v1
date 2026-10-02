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

## Repository operation matrix

The permission matrix follows the exact FPT `schema-repos.json#RepositoryPermission` descriptions without imposing a synthetic rank.

| Operation | Accepted RepositoryPermission | Current runtime |
| --- | --- | --- |
| read | read, triage, triage_plus, write, maintain, admin | Implemented through current Repository visibility/access |
| open | read, triage, triage_plus, write, maintain, admin | Implemented; creation policy is collaborators-only |
| comment | read, triage, triage_plus, write, maintain, admin | Deferred to IssueComment adoption |
| local workflow | read, triage, triage_plus, write, maintain, admin | Implemented; publisher/current-assignee responsibility is checked separately |
| triage | triage, triage_plus, write, maintain, admin | Classification only; no generic triage command |
| edit | triage, triage_plus, write, maintain, admin | Implemented for title/body/local criteria |
| close | triage, triage_plus, write, maintain, admin | Implemented for close/reopen + stateReason |
| assign | triage, triage_plus, write, maintain, admin | Implemented for add/remove assignees |
| manage-resource | none in Issue | Repository Label/Milestone definition management remains Repository-owned |
| lock-conversation | none in current runtime | Deferred to the separate conversation-lock capability |

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

## Mapping

Runtime owner: `packages/issue`. Repository scope provider: `packages/repository`. Web presentation remains on Repository resource routes without acquiring Issue authority.

Persisted relation ownership is authoritative in [data topology](../../architecture/data-topology.json); SQL definitions remain under `supabase/schemas/`.

Adjacent owners: [Repository](repository.md) · [Project](project.md) · [Notifications](notifications.md)
