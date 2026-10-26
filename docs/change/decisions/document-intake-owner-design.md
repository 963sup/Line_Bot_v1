# Document intake owner decision

Status: selected end-to-end direction; the main implementation boundary is now present in current source, while live provider and formal acceptance evidence remain separate. Original source baseline:
`7539638b0b10a5917a115a6ac699207d816a7f4b` (2026-10-25).
Implementation and evidence are tracked by
[#375](https://github.com/963sup/Line_Bot_v1/issues/375),
[#376](https://github.com/963sup/Line_Bot_v1/issues/376),
[#377](https://github.com/963sup/Line_Bot_v1/issues/377) and
[#378](https://github.com/963sup/Line_Bot_v1/issues/378).
This decision does not override current source, canonical architecture or SQL. Promote the
affected authority together with executable consumers and validation, then remove target-only
text that no longer has migration or recovery value.

The current source provides File's authorized original reader, Intelligence's durable technical
intake attempt, Contract-owned purchase-order candidates and confirmation, and complete
whole-revision Contract → Content → WBS expansion. Superseded File-processing and Content
`import-file` records remain readable only as retained history; their current writers are removed.
Local synthetic 54-line tests prove contract preservation, not live extraction of the supplied PDF.
Current Owner documents and canonical models describe that exact implementation boundary.

## Result and responsibility

An authorized document intake produces a complete target-owned structured record. For the
purchase-order acceptance fixture this means all 54 lines, not selected observations.
Content extends a complete Contract revision; WBS derives its Project planning document from
Content. Mapping rules are deterministic, versioned and applied to the complete source revision.
Users review extraction exceptions and authorize stage submissions; they do not invent mappings
for each row.

| Owner | Owns | Public capability and boundary |
| --- | --- | --- |
| File | Original bytes, immutable metadata revisions, upload/finalize, protected reads and reclamation | Read an exact authorized revision and verified bytes; requalify source identity/access at a target commit. No extraction schema, observations, processing result or target write. |
| Intelligence | Document-understanding protocol and orchestration, processor/model identity and technical attempt recovery | Read File through its public capability, extract against a target-owned input contract, submit through the target's public command. No direct target SQL or business activation authority. |
| Contract | Purchase-order/contract candidate and formal schemas, all accepted line facts, monetary rules, lifecycle, revisions and receipts | Publish the versioned extraction/intake contract and accept a complete structured command under current authorization. Publish complete revision facts to Content. |
| Content | Complete Contract-source coverage and the additional engineering definitions, hierarchy and planned quantities | Extend an exact Contract revision using a fixed mapping version; own its plan revision and target decision. Do not rewrite Contract terms. |
| WBS | Project work decomposition, drafts, proposals, review and Baselines | Derive a Project draft from an exact Content revision through a fixed mapping version. Import is not Baseline publication. |

File's current 500-observation and edit-count constraints describe a particular parser output;
they are not file-storage invariants. Remove those constraints from File when retiring that
write path. Bound extraction by the real target contract and measured payload/provider limits;
do not replace one unexplained global row limit with another.

## Target contract and dependency

The business owner publishes its own extraction/intake schema. A purchase-order schema belongs
to Contract. Other real consumers may publish different schemas without becoming Contract
subtypes. File format, document classification and target business intent are different inputs.
Unknown classification cannot silently choose or activate a business target.

Intelligence submits untrusted candidate values through a target-owned public input capability.
Contract rechecks actor, scope, source access, expected version, request identity and all domain
rules. A candidate can be saved as a Contract-owned draft without claiming legal effectiveness;
formal confirmation and activation follow the selected Contract lifecycle.

The target compile-time direction is:

```text
Intelligence -> File public source capability
Intelligence -> target public input contract (first real target: Contract)
Contract     -> File public source identity/authorization capability
Content      -> Contract public revision capability
WBS          -> Content public revision capability
```

Application hosts wire these capabilities. Domain models do not import foreign application or
provider implementations. Contract must stop importing Content types/verification for its new
Contract-first aggregate. Preserve historical Content-pinned engineering-agreement facts with
strict version-aware readers; do not reinterpret old rows as new purchase-order records or add
a forwarding compatibility writer. Existing Execution consumers require explicit version and
qualification handling in the same delivery.

Intelligence's target module role is application orchestration with provider adapters, rather
than only the current integration adapter. Promote that executable role and its technical
attempt ownership in the canonical models with the source change; do not invent a business
Bounded Context or empty Domain layer for the processing protocol.

## Complete data and fixed expansion

Contract's candidate schema records header identity, document revision/date, party roles,
currency, the complete line set, quantities/units, unit prices, gross/discount/net amounts,
delivery information, totals and relevant terms. Values retain source locations, raw text,
normalization and review corrections. Internal line identity is independent of item number,
material code or description. Decimal monetary values are exact; absent, uncertain and zero
are distinct. A model-produced JSON shape alone does not validate business meaning.

The external user-provided acceptance PDF discussed in
[#377](https://github.com/963sup/Line_Bot_v1/issues/377) contains 54 lines. It was inspected on
2026-10-25; it is not a committed repository fixture or an executed product test. Its gross
total is 99,613,576, discounts total
-18,113,576 and line net total 81,500,000. The printed tax is 4,075,001; preserve this value and
report the one-unit difference from a 5% calculation. Do not hard-code 54 as a general product
limit or fabricate a document's expected count when the source does not state it. Verify this
fixture against its reviewed line identities; test missing-page, omitted-row and cross-page
continuation failures separately from successful JSON validation.

Content consumes the entire accepted Contract revision in one command. Its mapping specification
defines exact source fields, grouping keys, their legitimate Content meanings, stable node identity,
quantity/unit treatment and source coverage. Every source line remains traceable. Non-work
charges need a legitimate Content representation; do not drop them or invent construction
Tasks. Content may add engineering planning facts while Contract remains the authority for
commercial values. Deriving these roles is design work in #376, not a row-by-row UI choice.

WBS consumes the whole selected Content revision in one command and validates its complete
coverage policy. Its mapping specification defines Deliverable/Work Package construction,
Project selection, source disclosure and private revision pins. Contract quantities, Content
planned quantities and WBS acceptance/governance remain distinct facts. Updating a source
creates a new target revision under its observed version; it never rewrites a published or
historical target. Explicit diff and conflict handling preserve user-authored expansion.

## Transaction and recovery

1. Reserve an authorized technical intake attempt with exact File revision/hash, target identity,
   schema/processor/model versions, stable request identity and an attempt token before provider I/O.
2. Read bytes through File, including its post-download authorization recheck. Provider I/O holds
   no PostgreSQL locks. Do not automatically retry or fall back after an unknown outcome.
3. Submit the complete candidate to Contract's input command. Recheck source and target
   authorization at commit; candidate/formal revision and receipt commit or roll back together.
4. Complete the technical attempt with the target receipt/revision reference. A lost response
   requires authorized target receipt readback; it must not create another Contract or silently
   replay provider work. Fence late completions by attempt identity.
5. Content and WBS have their own atomic whole-document commands, versions and receipts. Do not
   hold one transaction across all owners or across an external provider call.

Intelligence stores technical attempt evidence and target outcome references. Target-specific
structured candidates and formal values have one target owner; do not recreate File SavedResult
or a second generic authoritative structured-result store in Intelligence.

## Retained-data cutover and removal

Historical File storage combined upload and processing. `615_files.sql` contains
`file_processing_runs`, `file_processing_revisions` and `file_commands`; the latter has a shared
`(actor_user_id, request_id)` key and both file/processing receipt branches. Content historical
revisions may contain `import-file` evidence; WBS historical revisions may contain
`import-contract` evidence. These are executable historical facts, not permission to restore the
wrong new-write direction.

The implementation must inventory all Web, CLI, package exports, schemas, source pins, readers,
tests and generated projections before removal. Stop superseded new writes and replace their
real consumers; retain only necessary history decoding/replay until its cutover is verified.
No alias, forwarding export, dual writer, schema ignore or silent fallback is acceptable.

Keep immutable original File identities and historical Contract/Content/Execution/WBS versions.
Do not manufacture Contract lines from incomplete old observation sets. Existing processing
history needs an explicit Intelligence-owned historical evidence disposition and retention
policy, not an automatic conversion into a formal Contract.

Physical table names may remain when changing ownership would otherwise require a needless
rename. Move DDL and data-topology ownership together; a physical `file_` prefix does not grant
File authority. The shared receipt relation cannot simply acquire a new owner: separate the
actual File and processing receipts through a reviewed data-cutover with exact field/count/hash
readback, including the old cross-kind request collision behavior and the selected new request
namespace. Do not hide data movement inside schema reconciliation or drop old fields before
zero-stranded-receipt and exact-replay evidence.

Intelligence is the final read owner of retained historical processing runs, RawResult/SavedResult
and their migrated receipts. Its history reads and exact replay requalify current actor and
source Repository access, preserve original identities and values, and expose no new legacy
processing writer. File's old processing exports and routes are replaced by that owner; do not
leave forwarding APIs in File. No historical row expires merely because the implementation
changed or a release-evidence horizon elapsed. Until a separately authorized business retention
decision supplies deletion eligibility and recovery/readback evidence, preserve those rows.
Any eventual retirement must prove the eligible receipts and source pins have no remaining
replay/history consumers; the migration checklist cannot substitute for that disposition.

Current schema publication is governed by the existing Release path. No production data or
schema change is authorized by this document or PR. After migration/readback and recovery
verification, remove obsolete writers, exports, constraints and target-only guidance; preserve
only evidence that still has an active recovery purpose.

## Verification and performance

Use the 54-line fixture to prove complete Contract acceptance, deterministic Content/WBS
coverage, monetary discrepancies, source pins and exact replay. Add meaningful negative,
rollback and native PostgreSQL interleaving cases for changed authorization, competing versions,
receipt failure and late/unknown outcomes. Sanitized fixtures must not commit personal contacts
or the supplied private document.

Each import reads one complete source revision, performs pure deterministic mapping and commits
one target revision/receipt. Avoid per-line database round trips and provider work inside a
transaction. Measure provider latency/cost, completeness, review effort, pool/query/lock time and
whole-document mapping before changing parser/provider strategy or adding background machinery.
No unmeasured claim of fastest performance is part of this decision.

Each source promotion synchronizes semantic/data/module authority, manifests/exports, actual
consumers, SQL, docs and tests. Run affected lint/typecheck/test/build; architecture/public/schema
changes add their canonical gates. Static, native
DB, provider, deployment and LINE-device evidence remain separate. A source PR must identify
the exact completed slice and retained-data/release work still outstanding.
