# Candidate Atomic audit

**Audit revision:** current working tree  
**Owner:** L3/L5 candidate classification  
**Purpose:** record why candidate Atomics are not yet dispatchable and what evidence is required before promotion.

## Current inventory

| Status | Count | Meaning |
| --- | ---: | --- |
| enabled | 22 | Has an enabled executor, packet/handoff contract, capability route when needed, and validation boundary |
| candidate | 181 | Taxonomy and contract draft only; cannot be dispatched |
| retired roles | 22 | Historical specialist labels absorbed by the seven executor families |

The candidate catalog is intentionally broader than the current runtime. A
candidate is not incomplete merely because it is not enabled; it becomes
eligible only when a real repository task requires that bounded responsibility.

The legacy `prepare.*` / `execute.*` / `report.*` entries are retained only as
candidate taxonomy. No current task may dispatch them: a real task selects
one direct Atomic, and L5 represents preparation and reporting in the task
packet/handoff contract rather than as competing executor choices.

## Candidate families and executor readiness

The remaining 181 candidates include historical three-stage `prepare / execute / report` taxonomy entries.
The current catalog projection is:

| Candidate projection | Count | Existing executor mapping | Current decision |
| --- | ---: | --- | --- |
| candidates mapped to `reviewer` | 15 | `reviewer` | Candidate until a real review target and bounded finding contract exist |
| candidates mapped to `validation-runner` | 10 | `validation-runner` | Candidate until an assigned claim and command/flow exist |
| candidates mapped to `runtime-diagnostician` | 9 | `runtime-diagnostician` | Candidate until an exact runtime target is supplied |
| candidates mapped to `investigator` | 8 | `investigator` | Candidate until a real packet and source-backed consumer exist |
| candidates mapped to `analyst` | 6 | `analyst` | Candidate until the concrete decision or design is used |
| candidates mapped to `decider` | 6 | `decider` | Candidate until independent evidence is supplied by a real workflow |
| candidates mapped to `change-implementer` | 3 | `change-implementer` | Candidate until an approved write surface consumes it |
| specialised executor families without enabled profiles | 91 | none | Requires a demonstrated independent effect boundary before a profile is added |

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
   direct Atomic needed by the task.
2. Do not promote a lifecycle triplet. Preparation and reporting remain part
   of the L5 packet/result contract; promote one direct Atomic only when its
   bounded responsibility has a real consumer.
3. Add a new profile only after an existing executor demonstrably cannot own
   the work without mixing analysis, implementation, review, validation, or
   runtime observation.
4. Retire a candidate or profile only after the replacement consumer and
   migration evidence are present.

No candidate is promoted by this audit alone. This preserves the repository
contract that catalog status reflects real consumer and evidence state rather
than desired taxonomy completeness.

