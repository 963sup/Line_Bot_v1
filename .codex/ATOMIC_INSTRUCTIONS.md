# Atomic instructions

**Owner:** L3/L5 instruction design. **Audience:** role authors and Primary. **Type:** Reference.

An instruction is atomic when success can be evaluated from one bounded deliverable without needing an unstated second job. Atomicity is about one responsibility, not an arbitrary token limit or one file.

The [catalog](catalog/README.md) is the canonical Atomic dispatch contract.
An enabled Atomic names exactly one executor role and carries the specialised
goal, input, Must/Must Not, deliverable, stop condition, evidence boundary,
and required capability routes. Profiles retain only the shared execution
boundary. A candidate Atomic has no executor and cannot be dispatched.

## Executor profile fields

Every executor TOML specifies shared runtime fields under `developer_instructions`:

1. `Mission` — one execution boundary.
2. `Input` — packet, `atomicId`, scope, invariants, and prior evidence.
3. `Owns` — the execution boundary only.
4. `Must` / `Must Not` — shared safety and catalog-resolution obligations.
5. `Deliverable` / `Stop` / `Validation` — shared handoff boundary.

## Task instruction rules

- Use one verb and one subject. The enabled Atomic must have one `executorRoleId`, input, Must/Must Not, deliverable, stop condition, evidence boundary, and zero or more required L4 route IDs.
- State allowed and excluded scope. Absence of an exclusion is not permission to expand into a provider, schema, deployment, or another Owner.
- Assign one writer to a shared write surface.
- Require L4 route ID/state only if an L4 capability is actually selected.
- Require L5 packet/result for cross-role work; use L6 evidence routing before calling an outcome accepted.

## Rejection examples

| Non-atomic instruction | Why it fails | Split into |
| --- | --- | --- |
| “Research, design, implement, test, and deploy the feature” | Multiple decisions, writes, and evidence types | researcher/analyst → implementer → runner/verifier → release owner |
| “Use every relevant Skill and MCP” | Tool inventory is not a task | Select one L4 route per missing fact |
| “Fix all database problems” | No bounded result or Owner | relation design, transition plan, or exact defect review |

Read [AGENT_ROLES.md](AGENT_ROLES.md), [HANDOFF_PROTOCOL.md](HANDOFF_PROTOCOL.md), and [agents/README.md](agents/README.md) before creating a new profile.

## Candidate operation taxonomy

[catalog/atomic-catalog.json](catalog/atomic-catalog.json) records enabled and candidate Atomic operations. An enabled Atomic becomes selectable only when its executor profile, consumer, capability route when needed, handoff, and evidence boundary are real. A candidate has `candidateRoleIds` for taxonomy only; it deliberately has no `executorRoleId`.
