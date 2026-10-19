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

## Engineering quantities

Each revision has at most one optional quantity: decimal string + immutable measure ID +
REFERENCE/PLANNED purpose + optional fixed same-Repository Object revision source. Missing and
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

## Structure

- Relationships have stable identity, immutable source/target Object identities, a trimmed name,
  active state and an independent version/history. Both endpoints belong to the same Repository.
- REFERENCE preserves general directed-edge semantics, including cycles. Self edges and duplicate active source/name/target references are rejected.
- INCLUDES and ALLOCATES form an acyclic engineering structure with at most one active structural parent per Object. INCLUDES does not consume a parent quantity. ALLOCATES requires a planned child quantity using the identical measure definition and total direct allocations no greater than the parent quantity.
- LOCATED_IN points from engineering Object to a location Object. Each Object has at most one direct location; location is not inherited. Split cross-room work into children. Reparenting and changing location atomically remove the previous relationship and create a new relationship identity.
- New edges and renames require active endpoints; removing an edge remains available after endpoint
  archive. Archiving an Object does not silently remove existing edges.
- A relationship name does not imply hierarchy, dependency, access or lifecycle inheritance.
- An Object Revision freezes one Object's content, not the current target content or the entire
  Repository graph. Relationship history is independent; whole-graph snapshots are not implemented.

## Authorization and consistency

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

## Published references

Issue owns optional same-Repository references to a fixed Object Revision. Object publishes
transaction-bound reference validation/read capability; consumers never query its private tables.
New pins require a currently unarchived Object, while existing pins remain readable after archive
under current access. A newer Object revision never silently changes an existing Issue pin.

WBS and Discussion integration is subsequent work. WBS must retain Project authorization,
Repository source authorization and immutable Revision/Baseline semantics; Discussion must retain
its own collaboration authority. They do not become Object subtypes or current runtime consumers.

## Mapping and verification

Runtime owner: `packages/object`. The Repository Objects collection is a collapsible structural forest,
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

## Compatibility and publication

Existing revisions have no quantity and existing edges are REFERENCE; migration never infers facts
from labels or prose. Legacy command canonicalization and version-one receipt shape remain exact.
New receipts use version two. Deploy schema and runtime through the current main Release workflow;
never sync a development branch directly. After quantity data exists, use a forward fix: an old
runtime unaware of quantity snapshots would discard quantity on later revisions.
