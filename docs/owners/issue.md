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
- Create/transition operations re-check current Repository write/admin capability and eligible participants.
- Publisher and assignee responsibilities govern valid state transitions; conditional mutation requires the expected Issue version.
- Commands use stable request identity. Exact replay returns the prior result; conflicting reuse is rejected.
- Event/history is durable evidence and is not rewritten by current snapshots.
- Project references do not transfer Issue authority.

## Mapping

Runtime owner: `packages/issue`. Repository scope provider: `packages/repository`. Web presentation remains on Repository resource routes without acquiring Issue authority.

Persisted relation ownership is authoritative in [data topology](../../architecture/data-topology.json); SQL definitions remain under `supabase/schemas/`.

Adjacent owners: [Repository](repository.md) · [Project](project.md) · [Notifications](notifications.md)
