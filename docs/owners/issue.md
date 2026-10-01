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
- Permission names and Issue operations are separate contracts. The pinned FPT maps exact RepositoryPermission facts to these non-code Issue operations; it does not define a synthetic numeric rank:

  | Operation | RepositoryPermission rule | Independent gates | Current runtime |
  | --- | --- | --- | --- |
  | read | `READ / TRIAGE / TRIAGE_PLUS / WRITE / MAINTAIN / ADMIN` | Repository public visibility is a separate Repository-owned fact | current Issue routes still require current effective Repository access; generic public Issue read is not wired |
  | open | all six values | actor qualification + `IssueCreationPolicy`; `ALL` may admit a qualified actor on public scope, `COLLABORATORS_ONLY` requires the Repository-owned collaborator fact | generic open is not wired; current create also assigns work |
  | comment | all six values | actor qualification + readable scope + conversation lock; no lock override is inferred from RepositoryPermission | generic comment is not wired |
  | triage / edit / close / assign | `TRIAGE / TRIAGE_PLUS / WRITE / MAINTAIN / ADMIN` | current Repository access plus operation-specific actor/state rules | current assigned-work create/transition consumes this management set |
  | manage-resource | no grant from the Issue matrix | Repository-owned Label/Milestone or other resource policy | unavailable and fail closed |

- `canUseIssueOperation` is the canonical operation matrix. `canReadIssueScope`, `canOpenIssue` and `canCommentOnIssue` keep public visibility, actor qualification, creation policy and conversation lock as separate policy inputs instead of manufacturing Repository permissions.
- The current create command is deliberately stricter than generic open: it publishes an Issue and assigns another eligible participant in one transaction, so both actor and assignee must have `TRIAGE / TRIAGE_PLUS / WRITE / MAINTAIN / ADMIN`. `READ` alone can satisfy generic open/comment policy but cannot authorize this composite open+assign command.
- `accept / report / reject / approve` remain local publisher/assignee workflow responsibilities layered after Repository operation authorization. They are not presented as FPT generic authorization.
- Generic public Issue delivery, generic open/comment commands, standalone edit/close/assign, conversation lock mutation and Repository resource management are not current runtime capabilities. Missing command surfaces remain fail closed; the policy matrix does not activate a route or bypass current Repository scope, state, version or replay checks.
- Create/transition operations take the Repository governance read lock, then re-check current Repository operation capability and eligible participants in the same transaction. Access mutation takes the corresponding exclusive lock, so revoke cannot race authorization or resurrect a command through replay.
- Publisher and assignee responsibilities govern valid state transitions; conditional mutation requires the expected Issue version.
- Commands use stable request identity. Exact replay returns the prior result; conflicting reuse is rejected.
- Event/history is durable evidence and is not rewritten by current snapshots.
- Project references do not transfer Issue authority.

## Mapping

Runtime owner: `packages/issue`. Repository scope provider: `packages/repository`. Web presentation remains on Repository resource routes without acquiring Issue authority.

Persisted relation ownership is authoritative in [data topology](../../architecture/data-topology.json); SQL definitions remain under `supabase/schemas/`.

Adjacent owners: [Repository](repository.md) · [Project](project.md) · [Notifications](notifications.md)
