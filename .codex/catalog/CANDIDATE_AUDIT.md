# Candidate Atomic audit

**Audit revision:** current working tree  
**Owner:** L3/L5 candidate classification  
**Purpose:** record why candidate Atomics are not yet dispatchable and what evidence is required before promotion.

## Current inventory

| Status | Count | Meaning |
| --- | ---: | --- |
| enabled | 22 | Has an enabled executor, packet/handoff contract, capability route when needed, and validation boundary |
| candidate | 160 | Taxonomy and contract draft only; cannot be dispatched |
| retired roles | 22 | Historical specialist labels absorbed by the seven executor families |

The candidate catalog is intentionally broader than the current runtime. A
candidate is not incomplete merely because it is not enabled; it becomes
eligible only when a real repository task requires that bounded responsibility.

The `prepare.repository-mapper` → `execute.repository-mapper` →
`report.repository-mapper` triplet is enabled because the current repository
architecture audit is its real consumer. All three reuse the existing
`investigator` executor and have no additional capability route.

The same audit also consumes the `prepare.contract-locator` →
`execute.contract-locator` → `report.contract-locator` triplet to locate
authority before interpreting it. These three entries reuse `investigator` and
remain limited to source location, not product meaning.

The current six-layer architecture adjustment also consumes the
`prepare.architecture-analyst` → `execute.architecture-analyst` →
`report.architecture-analyst` triplet. It reuses `analyst`; the result remains
options and boundary evidence, not a final architecture decision.

The audit documentation itself consumes the `prepare.documentation-writer` →
`execute.documentation-writer` → `report.documentation-writer` triplet. It
reuses `change-implementer` and is limited to synchronizing approved facts;
`docs:check` supplies the corresponding document evidence.

The promotion process itself consumes the `prepare.change-impact-analyst` →
`execute.change-impact-analyst` → `report.change-impact-analyst` triplet to map
affected consumers before each catalog change. It reuses `analyst` and does
not authorize implementation.

PR 400 itself is a real review consumer for the
`prepare.diff-reviewer` → `execute.diff-reviewer` → `report.diff-reviewer`
triplet. It reuses `reviewer` and remains read-only; it does not authorize
merging or acceptance.

The promotion workflow also consumes the `prepare.test-designer` →
`execute.test-designer` → `report.test-designer` triplet to define the minimum
discriminating checks for each catalog change. It reuses `analyst`; it does not
execute tests or claim acceptance.

## Candidate families and executor readiness

The 181 candidates are mostly three-stage `prepare / execute / report` entries.
Their role taxonomy currently falls into these groups:

| Candidate group | Count | Existing executor mapping | Current decision |
| --- | ---: | --- | --- |
| repository/technical/component/contract investigation | 14 | `investigator` | Candidate until a real packet and source-backed consumer exist |
| root-cause/architecture/performance/database/schema/test/change analysis | 21 | `analyst` | Candidate until the concrete decision or design is used |
| architecture/acceptance/threat decisions | 9 | `decider` | Candidate until independent evidence is supplied by a real workflow |
| implementation/documentation | 6 | `change-implementer` | Candidate until an approved write surface consumes it |
| diff/auth/persistence/UI/actions/dependency reviews | 21 | `reviewer` | Candidate until a review target and bounded finding contract exist |
| Next/Sentry/LINE runtime diagnostics | 9 | `runtime-diagnostician` | Candidate until an exact runtime target is supplied |
| validation/browser/evidence | 10 | `validation-runner` | Candidate until an assigned claim and command/flow exist |
| specialised executor families without profiles | 91 | none | Requires a demonstrated independent effect boundary before a profile is added |

The counts above are a taxonomy projection of `atomic-catalog.json`; the JSON
catalog remains authoritative.

## Promotion gate

Promote one candidate only when all of the following evidence exists:

1. A real task packet names the exact `atomicId`, business result, allowed and
   excluded scope, and validation owner.
2. The candidate has one accountable executor. Reuse an enabled executor when
   its effect boundary is sufficient; add a profile only when it would
   otherwise cross a responsibility boundary.
3. Any required L4 route is present in `CAPABILITIES.md` and its preflight,
   fallback, and evidence boundary are concrete.
4. The L5 handoff can return the candidate's deliverable, stop condition,
   assumptions, unresolved risk, and evidence boundary.
5. L6 has a claim-specific validation path that does not pretend to prove
   provider, deployment, browser, device, or product behavior outside scope.
6. `pnpm tooling:check` and `pnpm docs:check` pass after the promotion.

## First activation order

When concrete work arrives, use this order to minimize new surfaces:

1. Reuse the seven existing executor profiles and promote only the exact
   candidate needed by the task.
2. Promote the matching `prepare`, `execute`, and `report` triplet only if
   all three are actually consumed by the workflow; otherwise keep unused
   stages as candidates.
3. Add a new profile only after an existing executor demonstrably cannot own
   the work without mixing analysis, implementation, review, validation, or
   runtime observation.
4. Retire a candidate or profile only after the replacement consumer and
   migration evidence are present.

No candidate is promoted by this audit alone. This preserves the repository
contract that catalog status reflects real consumer and evidence state rather
than desired taxonomy completeness.
