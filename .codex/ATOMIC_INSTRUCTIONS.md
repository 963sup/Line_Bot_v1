# Atomic instructions

**Owner:** L3/L5 instruction design. **Audience:** role authors and Primary. **Type:** Reference.

An instruction is atomic when success can be evaluated from one bounded deliverable without needing an unstated second job. Atomicity is about one responsibility, not an arbitrary token limit or one file.

## Required role instruction fields

Every role TOML specifies these fields under `developer_instructions`:

1. `Mission` — one observable responsibility.
2. `Input` — minimum authoritative facts and scope.
3. `Owns` — only the decision/action named by the mission.
4. `Must` — evidence, safety, and reporting obligations.
5. `Must Not` — adjacent roles, writes, or authority it cannot take.
6. `Deliverable` — exact bounded output.
7. `Stop` — completion or prerequisite failure boundary.
8. `Validation` — what keeps its claim from exceeding evidence.

## Task instruction rules

- Use one verb and one subject: map a consumer path, analyse a cause, review a diff, implement a decided change, or execute an assigned check.
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
