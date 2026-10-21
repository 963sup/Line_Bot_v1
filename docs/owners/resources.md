# Resources

Resources owns new Repository-scoped physical Location, Equipment and Material identities. A physical
Resource has an explicit immutable kind, versioned name/description, `ACTIVE | ARCHIVED` lifecycle,
immutable revisions and durable command receipts. Creation requires the kind; edit cannot change it;
archive and unarchive append revisions. Names, legacy Object Types, relationship shape and quantity
units never infer a physical kind.

The new public reference reader returns an exact physical Resource revision basis
`{resourceId, resourceRevisionId, resourceVersion, kind, name}` in caller order. New pins must match
the current Resource head and normally require an active Resource. A consumer may explicitly allow
an archived head; this does not allow arbitrary historical revisions. Existing frozen pins remain
unchanged. Current Repository access is always rechecked. [Content](content.md) stores exact pins in plan revisions;
[Execution](execution.md) freezes the explicitly supplied physical Resource bases with a submission.

Repository owns the enclosing access and archive policy. The neutral
`@line_bot_v1/platform/text` mechanism validates Resource name/description values; Resources retains
identity, kind, lifecycle, errors, transaction, revision and persistence authority.

Current active User and Repository access are rechecked for physical Resource reads, writes and
receipt replay. WRITE, MAINTAIN or ADMIN may create/edit/archive/unarchive. Permission is checked
before replay; authorized exact replay may return a committed revision after Repository archive,
while new mutations are rejected. Expected version, head, immutable revision and receipt commit or
roll back in one transaction. Reusing an actor/request identity with changed input conflicts.

## Legacy Object model still in service

The same package also continues to own the pre-existing `Object*` command/read model, Repository-local
Object Type classifications, immutable Object revisions, directed Object relationships, engineering
quantities and their durable receipts. Its `objectId` fields, `objects` HTTP routes, `object_*` SQL
names and receipt fingerprints remain current transport/storage contracts while existing writers and
consumers are migrated deliberately. They are not aliases for the new physical Resource model.

Existing Object rows are not automatically classified or copied into physical Resources. The data
classification and cutover policy is still unresolved, so history must remain under its original
model. Repository Label/Milestone APIs named `resources` remain Repository-owned capabilities.

### Legacy content and classification

- A legacy Object has stable identity, one Repository and exactly one Object Type. Rename, reclassification,
  archive, unarchive and restore preserve identity and append an immutable revision.
- Object Type is a Repository-local classification with a unique case-insensitive trimmed name,
  description, enabled state and version. It does not define dynamic fields, schema or workflow.
- Disabled Types remain readable and permit editing existing content with unchanged classification;
  they reject creation, new assignment and historical restoration until re-enabled.
- Each Object Revision captures content, classification identity and its historical display name,
  lifecycle, parent revision and actor/time. Historical restoration appends a new revision.
- Archived Objects retain historical reads and existing references, but reject new references and
  ordinary edits. Unarchive is an explicit versioned command. There is no permanent delete.

### Legacy engineering quantities

Each revision has at most one optional quantity: decimal string + immutable measure ID +
REFERENCE/PLANNED purpose + optional fixed same-Repository Resource revision source. Missing and
explicit zero differ. A source pin records provenance, not legal effectiveness; absent provenance
is shown as 來源未登錄. ADMIN creates Repository-local measure definitions (name, subject/method,
unit); readers can list and use them. Corrections create a new definition. Equal units alone do
not establish comparable quantities: termination and number sleeves remain separate measures.

Metres accept up to three decimals; pcs accepts integer strings. Excess precision is rejected,
never rounded. Quantities are nonnegative with at most 15 integer digits, use fixed-point BigInt
in domain decisions and exact numeric in PostgreSQL, and travel as strings.

`set-quantities` changes 1–100 Objects atomically, advancing each changed revision exactly once.
It includes expected Object versions and observed allocation/relationship basis versions with immutable endpoints and kinds. Queries return the selected parent/page neighborhood and its allocation basis rather than the entire Repository; pages and a selected target are merged without replacing already observed versions. Both current and observed edge sets are checked, so a removed edge also conflicts. Quantity
reduction, clearing, measure changes and restoration revalidate parent and children. Archive does
not release quantities: explicitly detach the relationship when a scope is withdrawn.

The engineering, location and Object Type views share identities. Tree children use per-level
keyset pagination; server totals cover the entire selected root. Totals replace subdivided parents
with child quantities plus parent residuals, avoiding double counting and preserving unassigned
fragments. Grouping retains measure and purpose; REFERENCE baselines and PLANNED work remain
separate. Navigating a descendant that moved outside the root returns to the root without treating that navigation change as lost access. Object Type supplies work classification. No AllocationPlan or second type catalog exists.

For A=8500m with direct allocations 2000+1000+3000+2000, allocated is 8000m and residual 500m.
Splitting B=2000m into 1200+800 does not increase that total. Supporting 8pcs quantities are INCLUDES
and do not consume metres. Formal approval, actual measurement, acceptance, invoices, PDF extraction
and historical whole-graph snapshots are outside this capability.

### Legacy Object structure

- Relationships have stable identity, immutable source/target Object identities, a trimmed name,
  active state and an independent version/history. Both endpoints belong to the same Repository.
- REFERENCE preserves general directed-edge semantics, including cycles. Self edges and duplicate active source/name/target references are rejected.
- INCLUDES and ALLOCATES form an acyclic engineering structure with at most one active structural parent per Resource. INCLUDES does not consume a parent quantity. ALLOCATES requires a planned child quantity using the identical measure definition and total direct allocations no greater than the parent quantity.
- LOCATED_IN points from one legacy Object to another location-designated Object. Each Object has at
  most one direct location; the relationship never proves the target is a new physical `LOCATION`.
  Location is not inherited. Split cross-room work into children. Reparenting and changing location
  atomically remove the previous relationship and create a new relationship identity.
- New edges and renames require active endpoints; removing an edge remains available after endpoint
  archive. Archiving an Object does not silently remove existing edges.
- A relationship name does not imply hierarchy, dependency, access or lifecycle inheritance.
- An Object Revision freezes one Object's content, not the current target content or the entire
  Repository graph. Relationship history is independent; whole-graph snapshots are not implemented.

### Legacy authorization and consistency

- Current active User and Repository access are rechecked through the Repository public scope
  contract, including historical reads and exact replay. A locator or reference never authorizes.
- Object and relationship writes accept explicit WRITE, MAINTAIN or ADMIN. Type and immutable measure creation require
  ADMIN. Permission values are not interpreted as an invented numeric rank.
- Repository archive blocks new mutations; authorized exact replay may return its committed receipt.
- Governance, current Repository scope, request identity, aggregate version and required participant
  locks protect a single transaction. State, immutable revisions and receipt commit or roll back
  together. Reusing a request ID with a different fingerprint conflicts.
- Revisions and receipts are insert/read-only to the runtime role. No runtime DDL or provider-owned
  schema mutation is introduced.

### Legacy published references

Issue owns optional same-Repository references to a fixed Object Revision. The legacy Object model publishes
transaction-bound reference validation/read capability; consumers never query its private tables.
New pins require a currently unarchived Resource, while existing pins remain readable after archive
under current access. A newer Resource revision never silently changes an existing Issue pin.

Historical [Contract](contract.md) revisions may contain a frozen Object quantity basis created by
the earlier transaction-bound quantity reader. Those immutable snapshots and exact receipts stay
readable, but new Contract commitments do not write that form. Existing Object reference DTOs retain
their published shape.

WBS and Discussion integration is subsequent work. WBS must retain Project authorization,
Repository source authorization and immutable Revision/Baseline semantics; Discussion must retain
its own collaboration authority. They do not become Resource subtypes or current runtime consumers.

## Mapping and verification

Runtime owner: `packages/resources`. New physical Resource APIs and the legacy Object APIs are
separate public surfaces in that package. The legacy Repository Objects collection is a collapsible structural forest,
with per-level cursor pages and inline plus creation through the existing `create-child` command.
Inline children use INCLUDES without a quantity; allocation and quantity editing remain in detail.
Archived ancestors remain visible as context for active descendants; the archive toggle includes fully archived branches.
Web presents classification management,
content/history and relationship lists beneath the Repository locator. Issue remains the first
external consumer. Current mappings, exports and executable SQL are governed by the canonical
architecture models, manifests and declarative schemas.

Verify domain transitions, SQL constraints/grants, authorization and atomic replay, real PostgreSQL
multi-session races, HTTP identity/origin/isolation and browser retry/session behavior. Local source,
schema, native database, browser and provider deployment evidence remain separate.

## Legacy compatibility and publication

Existing revisions have no quantity and existing edges are REFERENCE; migration never infers facts
from labels or prose. Legacy command canonicalization and version-one receipt shape remain exact.
New receipts use version two. Deploy schema and runtime through the current main Release workflow;
never sync a development branch directly. After quantity data exists, use a forward fix: an old
runtime unaware of quantity snapshots would discard quantity on later revisions.
