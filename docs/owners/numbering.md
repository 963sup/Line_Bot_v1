# Numbering

Numbering owns scoped sequential `Series` and immutable committed `Allocation` facts. The package
contract and implementation routing are described in the
[detailed reference](../reference/domains/numbering.md).

## Owns

- The identity of a Series: number family plus typed stable scope.
- Atomic, positive, monotonically increasing allocation inside one Series.
- Idempotency for the same resource inside the same Series.
- Immutable committed allocation history and scoped number resolution.
- A verified legacy high-water checkpoint and the first managed number for each activated Series.

## Boundaries

Resource Owners decide whether and when to allocate. They retain identity, lifecycle, authorization,
version checks, exact request replay, events and receipts. They call Numbering with the same `Sql`
transaction that persists the resource, so allocation, resource state and replay evidence commit or
roll back together.

Numbering depends only on Platform database mechanisms. It does not import Namespace, inspect a
consumer's private tables, authorize users, create resources, or expose an independent HTTP endpoint.
Namespace and Numbering may participate in the same caller transaction while remaining independent
Owners.

## Families

| Family | Typed scope | Compatible resource |
| --- | --- | --- |
| `repository-work-item` | `REPOSITORY` | `ISSUE`, future inactive `PULL_REQUEST` |
| `repository-discussion` | `REPOSITORY` | `DISCUSSION` |
| `repository-milestone` | `REPOSITORY` | `MILESTONE` |
| `account-project` | `USER` or `ORGANIZATION` | `PROJECT` |
| `project-view` | `PROJECT` | `PROJECT_VIEW` |

`repository-work-item` intentionally shares the Issue/Pull Request sequence. Pull Request remains a
selected target: accepting its resource kind does not activate a Pull Request package, schema, route,
or runtime capability.

## Invariants

1. A committed number is never reset, released, reassigned or reused after resource deletion or a
   later scope move.
2. The same Series and resource identity retries to the same number; another resource receives a
   distinct number.
3. Allocation and counter advance are one database transaction. A rollback commits neither.
4. Repository, Account and Project stable IDs form scopes; mutable names and logins never do.
5. `project-view` stays within signed 32-bit storage. Other families stay within the JavaScript safe
   integer limit while their current resource columns remain `bigint`.
6. Cutover preserves existing public numbers and URLs. Missing historical facts are not invented.
7. After activation, an old `max(number) + 1` writer cannot safely resume. Recovery uses a compatible
   Numbering build or freezes writes while the registry is repaired forward.
8. Database authority activation does not make application writers ready. Platform keeps affected
   runtime writes frozen until an exact compatible deployed revision is verified and explicitly
   activated; Numbering cannot bypass that gate or fall back to a legacy allocator.
