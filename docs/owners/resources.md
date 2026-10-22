# Resources

Resources owns Repository-scoped physical Location, Equipment and Material identities. A physical
Resource has an explicit immutable kind, versioned name and description, an `ACTIVE | ARCHIVED`
lifecycle, immutable revisions and durable command receipts. Creation requires the kind; edit cannot
change it; archive and unarchive append revisions. Names, prose and units never infer physical kind.

The legacy Object, Object Type, quantity, relationship and engineering model is retired. Resources
does not publish compatibility contracts for it. Content remains the authority for work structure and
planned quantities; Execution remains the authority for actual reports and review.

## Public reference contract

The reference reader returns an exact physical Resource revision basis
`{resourceId, resourceRevisionId, resourceVersion, kind, name}` in caller order. New pins must match
the current Resource head and normally require an active Resource. A consumer may explicitly allow an
archived head; this does not permit arbitrary historical revisions. Existing frozen Content and
Execution pins retain their stored facts. Current Repository access is always rechecked.

## Authorization and consistency

- Current active User and Repository access are rechecked for reads, writes and receipt replay.
- WRITE, MAINTAIN or ADMIN may create, edit, archive and unarchive physical Resources.
- Permission is checked before replay. Authorized exact replay may return a committed revision after
  Repository archive; new mutations are rejected.
- Expected version, head, immutable revision and durable receipt commit or roll back in one
  Repository transaction.
- Reusing an actor/request identity with changed input conflicts.
- Runtime access to immutable revisions is read-only except when inserting the next committed
  revision. Runtime code does not perform DDL.

Repository owns enclosing access and archive policy. The neutral `@line_bot_v1/platform/text`
mechanism normalizes Resource name and description values; Resources retains identity, kind,
lifecycle, errors, transaction, revision and persistence authority.

## Mapping and verification

Runtime owner: `packages/resources`. Web consumes the physical Resource application and composition
contracts. Content and Execution consume the public reference reader; consumers never query
Resource-owned relations directly.

Verify domain transitions, current authorization, expected-version conflicts, exact replay,
transaction rollback, immutable revision reads and ordered current-head reference validation. Local
source, schema, native database, deployment and provider evidence remain separate.
