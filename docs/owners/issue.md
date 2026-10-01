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
- Issue reads and commands first re-check current Repository access; public Repository visibility never substitutes for current collaborator access.
- Issue creation adopts FPT `schema-issues.json#IssueCreationPolicy = COLLABORATORS_ONLY`: after current collaborator access is established, every exact RepositoryPermission may open an Issue.
- The current local `accept / report / reject / approve` workflow requires current Repository access but does not reuse the generic FPT manage-Issue permission set. Publisher and assignee responsibilities are the separate Issue business policy that authorizes those workflow steps; conditional mutation requires the expected Issue version.
- Generic triage/edit/close/assign capabilities remain distinct: their permission classification is `triage | triage_plus | write | maintain | admin`, and they are not implied by local workflow responsibility.
- Commands use stable request identity. Exact replay returns the prior result; conflicting reuse is rejected.
- Event/history is durable evidence and is not rewritten by current snapshots.
- Project references do not transfer Issue authority.

## Repository operation matrix

The permission matrix follows the exact FPT `schema-repos.json#RepositoryPermission` descriptions without imposing a synthetic rank.

| Operation | Accepted RepositoryPermission | Current runtime |
| --- | --- | --- |
| read | read, triage, triage_plus, write, maintain, admin | Implemented through current Repository access |
| open | read, triage, triage_plus, write, maintain, admin | Implemented; creation policy is collaborators-only |
| comment | read, triage, triage_plus, write, maintain, admin | Deferred to IssueComment adoption |
| local workflow | read, triage, triage_plus, write, maintain, admin | Implemented for accept/report/reject/approve; publisher/assignee responsibility is checked separately |
| triage | triage, triage_plus, write, maintain, admin | Generic manage-Issue classification; no separate runtime triage command yet |
| edit | triage, triage_plus, write, maintain, admin | Deferred to general Issue content editing |
| close | triage, triage_plus, write, maintain, admin | Deferred to FPT IssueState adoption |
| assign | triage, triage_plus, write, maintain, admin | Deferred to Assignable collection adoption |
| manage-resource | none in Issue | Repository Label/Milestone definition management remains Repository-owned and deferred |
| lock-conversation | none in current runtime | Deferred to the separate conversation-lock capability |

The matrix classifies permission only. Actor qualification/current access, the fixed collaborators-only creation policy, local publisher/assignee workflow responsibility, and any future conversation lock are evaluated as separate policies. A READ collaborator who opens or accepts local work can therefore finish the required local workflow without acquiring generic triage authority. Unsupported operations stay fail-closed rather than inheriting capabilities from another row.

## Mapping

Runtime owner: `packages/issue`. Repository scope provider: `packages/repository`. Web presentation remains on Repository resource routes without acquiring Issue authority.

Persisted relation ownership is authoritative in [data topology](../../architecture/data-topology.json); SQL definitions remain under `supabase/schemas/`.

Adjacent owners: [Repository](repository.md) · [Project](project.md) · [Notifications](notifications.md)
