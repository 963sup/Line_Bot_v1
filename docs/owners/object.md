# Object

Object owns Repository-native content instances, Repository-local Object Type classifications,
immutable Object Revisions, directed Object-to-Object Relationships and their independent immutable
revisions, and durable command receipts. It is a local product domain, distinct from GitObject.
Repository owns the enclosing identity, current access, visibility and archive state. Object is not
a universal model for Issue, WBS, Discussion or other bounded contexts.

## Content and classification

- Object has stable identity, one Repository and exactly one Object Type. Rename, reclassification,
  archive, unarchive and restore preserve identity and append an immutable revision.
- Object Type is a Repository-local classification with a unique case-insensitive trimmed name,
  description, enabled state and version. It does not define dynamic fields, schema or workflow.
- Disabled Types remain readable and permit editing existing content with unchanged classification;
  they reject creation, new assignment and historical restoration until re-enabled.
- Each Object Revision captures content, classification identity and its historical display name,
  lifecycle, parent revision and actor/time. Historical restoration appends a new revision.
- Archived Objects retain historical reads and existing references, but reject new references and
  ordinary edits. Unarchive is an explicit versioned command. There is no permanent delete.

## Structure

- Relationships have stable identity, immutable source/target Object identities, a trimmed name,
  active state and an independent version/history. Both endpoints belong to the same Repository.
- Directed cycles are permitted. Self edges and duplicate active source/name/target edges are not.
- New edges and renames require active endpoints; removing an edge remains available after endpoint
  archive. Archiving an Object does not silently remove existing edges.
- A relationship name does not imply hierarchy, dependency, access or lifecycle inheritance.
- An Object Revision freezes one Object's content, not the current target content or the entire
  Repository graph. Relationship history is independent; whole-graph snapshots are not implemented.

## Authorization and consistency

- Current active User and Repository access are rechecked through the Repository public scope
  contract, including historical reads and exact replay. A locator or reference never authorizes.
- Object and relationship writes accept explicit WRITE, MAINTAIN or ADMIN. Type management requires
  ADMIN. Permission values are not interpreted as an invented numeric rank.
- Repository archive blocks new mutations; authorized exact replay may return its committed receipt.
- Governance, current Repository scope, request identity, aggregate version and required participant
  locks protect a single transaction. State, immutable revisions and receipt commit or roll back
  together. Reusing a request ID with a different fingerprint conflicts.
- Revisions and receipts are insert/read-only to the runtime role. No runtime DDL or provider-owned
  schema mutation is introduced.

## Published references

Issue owns optional same-Repository references to a fixed Object Revision. Object publishes
transaction-bound reference validation/read capability; consumers never query its private tables.
New pins require a currently unarchived Object, while existing pins remain readable after archive
under current access. A newer Object revision never silently changes an existing Issue pin.

WBS and Discussion integration is subsequent work. WBS must retain Project authorization,
Repository source authorization and immutable Revision/Baseline semantics; Discussion must retain
its own collaboration authority. They do not become Object subtypes or current runtime consumers.

## Mapping and verification

Runtime owner: `packages/object`. Web presents the Objects collection, classification management,
content/history and relationship lists beneath the Repository locator. Issue remains the first
external consumer. Current mappings, exports and executable SQL are governed by the canonical
architecture models, manifests and declarative schemas.

Verify domain transitions, SQL constraints/grants, authorization and atomic replay, real PostgreSQL
multi-session races, HTTP identity/origin/isolation and browser retry/session behavior. Local source,
schema, native database, browser and provider deployment evidence remain separate.
