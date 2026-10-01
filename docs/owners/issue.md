# Issue

Read this file for Issue ownership and invariants.

## Responsibility

Issue owns:

- Issue identity within a Repository and repository-scoped Issue number as a consumed Repository allocation;
- Issue lifecycle, publisher, assignee, title, criteria, status and version;
- replay-safe Issue commands and durable Issue event history;
- Issue → Repository Label association facts.

Repository remains authoritative for Repository identity, current effective access, participant scope, Label/Milestone definitions and allocation of the next repository-scoped Issue number. Project may reference Issue but cannot rewrite Issue state.

## Invariants

- Every Issue belongs to exactly one Repository.
- Issue number is unique only within its Repository scope.
- Permission names and Issue operations are separate contracts. FPT describes the following non-code ability groups; `available` here reports current runtime support rather than granting a route:

  | Operation | FPT permission | Current runtime |
  | --- | --- | --- |
  | read | `READ / TRIAGE / TRIAGE_PLUS / WRITE / MAINTAIN / ADMIN` | available for currently authorized Repository participants |
  | open | all six values; also subject to `IssueCreationPolicy` | unavailable as a generic command; current create includes assignment |
  | comment | all six values | unavailable |
  | triage / edit / close / assign | `TRIAGE / TRIAGE_PLUS / WRITE / MAINTAIN / ADMIN` | only the local assigned-work create/transition flow is available |
  | manage Repository Label/Milestone definitions | not an Issue operation; Repository-owned policy | unavailable |
  | lock/unlock conversation | separate lock policy | unavailable |

  The table records only abilities stated by the pinned FPT. It does not infer a permission ranking or undocumented `TRIAGE_PLUS` abilities.
- Current create is a local assigned-work command: it publishes an Issue and assigns another eligible participant in one transaction. `accept / report / reject / approve` are local work transitions governed by separate publisher/assignee responsibilities. Both require an explicit Issue-management permission (`TRIAGE / TRIAGE_PLUS / WRITE / MAINTAIN / ADMIN`); `READ` alone cannot use these commands.
- Generic open/comment, public anonymous visibility, `IssueCreationPolicy`, conversation lock and standalone edit/close/assign/resource-management commands are not current runtime capabilities. The table does not activate a route or bypass actor qualification, current Repository scope, visibility, creation policy, lock, state, version or replay checks; unavailable operations fail closed because no command exists.
- Create/transition operations take the Repository governance read lock, then re-check current Repository operation capability and eligible participants in the same transaction. Access mutation takes the corresponding exclusive lock, so revoke cannot race authorization or resurrect a command through replay.
- Publisher and assignee responsibilities govern valid state transitions; conditional mutation requires the expected Issue version.
- Commands use stable request identity. Exact replay returns the prior result; conflicting reuse is rejected.
- Event/history is durable evidence and is not rewritten by current snapshots.
- Project references do not transfer Issue authority.

## Mapping

Runtime owner: `packages/issue`. Repository scope provider: `packages/repository`. Web presentation remains on Repository resource routes without acquiring Issue authority.

Persisted relation ownership is authoritative in [data topology](../../architecture/data-topology.json); SQL definitions remain under `supabase/schemas/`.

Adjacent owners: [Repository](repository.md) · [Project](project.md) · [Notifications](notifications.md)
