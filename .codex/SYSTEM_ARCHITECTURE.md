# Six-layer agent system architecture

**Owner:** `.codex/` runtime architecture. **Audience:** Primary and role authors.
**Type:** Design reference.

## Purpose

The system turns an authorized repository objective into a supported result without confusing governance, roles, tools, task state, or evidence. Each concern has one owner. A layer may request an earlier layer to resolve a missing fact; it may not invent that fact.

## Layer model

| Layer | Owns | Canonical document | Must not own |
| --- | --- | --- | --- |
| L1 Governance | Repository truth, authorization, domain contracts, invariants | Root [AGENTS.md](../AGENTS.md), `architecture/`, `docs/rules/` | Runtime role selection or tool configuration |
| L2 Orchestration | Scope reduction, role/capability/evidence selection, integration | [ORCHESTRATION.md](ORCHESTRATION.md) | Product truth, implementation, or acceptance evidence |
| L3 Roles | One specialist responsibility and bounded deliverable | [AGENT_ROLES.md](AGENT_ROLES.md) | Workflow ownership, tools as authority, or another role's work |
| L4 Capabilities | Method/transport selection with preflight and fallback | [CAPABILITIES.md](CAPABILITIES.md) | Business ownership, provider permission, or final acceptance |
| L5 Atomic work | Task packet and handoff interchange | [WORKFLOWS.md](WORKFLOWS.md), [HANDOFF_PROTOCOL.md](HANDOFF_PROTOCOL.md) | A hidden worker, domain process, or provider authorization |
| L6 Validation | Claim-to-evidence routing and acceptance boundary | [VALIDATION.md](VALIDATION.md) | Creating its own evidence or redefining product truth |

## Required flow

```text
L1 business result + invariant
  → L2 minimal route
  → L3 one accountable specialist
  → optional L4 route after preflight
  → L5 packet/result
  → L6 claim-specific evidence
  → L2 integrates, or returns to the earliest owner of the gap
```

The chain is conditional, not ceremonial. A known single-owner document edit can stop at L2. An unresolved data ownership decision can require L1 → L2 → L3 before any L4 capability is selected.

## Return-path invariant

| Missing fact | Return to |
| --- | --- |
| Truth, product meaning, authorization, or Owner | L1 / L2 |
| Analysis, diagnosis, design, implementation, or review | L3 |
| Command, MCP, Skill, connection, or local tool prerequisite | L4 |
| Goal, scope, inputs, deliverable, or stop condition | L5 |
| Claim, target, evidence type, or unsupported remainder | L6 |

## Source-of-truth rule

This architecture is an orchestration design only. Actual commands remain in [`package.json`](../package.json), MCP configuration in [`config.toml`](config.toml), profiles in [`agents/`](agents/README.md), and proof limits in repository [validation rules](../docs/rules/validation-evidence.md). The JSON Schemas define interchange shape, not product contracts or permissions.

## Navigation

Read [README.md](README.md) for the directory map, [ATOMIC_INSTRUCTIONS.md](ATOMIC_INSTRUCTIONS.md) before creating/changing a role or task instruction, and [schemas/README.md](schemas/README.md) when producing a machine-readable packet, handoff, route, or evidence plan.
