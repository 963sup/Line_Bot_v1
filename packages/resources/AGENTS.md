# Resources constraints

Resources owns Repository-scoped physical Location, Equipment and Material identity and lifecycle.
It does not own work structure, planned or actual quantities, or the retired legacy Object model.

Inherits [packages](../AGENTS.md).

- Every read and mutation rechecks the current active User and Repository scope through the
  Repository public contract. A locator or reference never authorizes.
- Physical Resource kind is explicit and immutable. Names, prose, historical Object Types and units
  do not infer physical identity.
- Identity and kind remain stable while edits, archive and unarchive append immutable revisions.
- Writes use expected version and durable request identity. The head, revision and exact receipt
  commit or roll back in one Repository transaction; changed replay input conflicts.
- Permission is checked before replay. Authorized exact replay may return a committed revision after
  Repository archive, while new mutations remain blocked.
- The public reference reader preserves caller order and returns an exact current revision basis.
  New pins require the current head and normally an active Resource; an explicit archived-head policy
  does not permit arbitrary historical revisions.
- Content and Execution own their plans and reports. They consume only the Resource public reference
  contract and retain their own frozen pins.
- Shared text normalization comes from Platform. Resources retains identity, kind, lifecycle,
  transaction, persistence and error authority.
- Do not reintroduce legacy Object, Object Type, quantity, relationship, engineering or compatibility
  surfaces in this package.
