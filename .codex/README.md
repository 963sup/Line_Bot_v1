# Codex runtime architecture

**Layer coverage:** L2–L6 runtime design. L1 remains repository-owned and is routed from L2 rather than duplicated inside `.codex`.

`.codex/` owns local Codex runtime configuration and operational conventions. It is **not** a source of product behaviour, business facts, or external-platform authority. Product truth remains in the repository contracts, architecture inputs, source, schema, and tests named by the root [AGENTS.md](../AGENTS.md).

## Navigation

| Path | Layer | Owner | Purpose |
| --- | --- | --- | --- |
| [ORCHESTRATION.md](ORCHESTRATION.md) | L2 | Primary orchestration | Routes governance input to the minimum role, capability, workflow, and evidence loop. |
| [agents/](agents/README.md) | L3 | Specialist roles | Defines atomic TOML responsibilities, profile naming, and role admission. |
| [catalog/](catalog/README.md) | L3/L5 | Role taxonomy and Atomic dispatch | Keeps candidate work non-dispatchable; enabled Atomics derive one executor profile. |
| [CAPABILITIES.md](CAPABILITIES.md) | L4 | Capability routing | Routes only actually consumed commands, MCPs, and Skills to roles and evidence boundaries. |
| [rules/](rules/) | L4 | Command-safety policy | Constrains shell command patterns; it does not authorize product or provider writes. |
| [scripts/](scripts/) | L4 | Codex support scripts | Supports runtime configuration only. |
| [WORKFLOWS.md](WORKFLOWS.md) | L5 | Atomic workflow composition | Orders only necessary atomic responsibilities. |
| [HANDOFF_PROTOCOL.md](HANDOFF_PROTOCOL.md) | L5 | Atomic handoff | Owns task-packet, result, route state, and bounded-output contract. |
| [VALIDATION.md](VALIDATION.md) | L6 | Evidence and acceptance routing | Maps claims to the independent evidence that can support them. |
| [schemas/](schemas/README.md) | L4–L6 | Machine contract | Holds JSON Schema forms for cross-role artifacts. |
| [config.toml](config.toml) | L2 + L4 | Codex runtime configuration | Enables project agents and configures shared MCP transports. |
| [AGENTS.md](AGENTS.md) | Runtime | Runtime-scope instructions | Executable constraints and validation entry points. |

## Context-loading policy

Load the smallest node that owns the decision. An agent-profile change reads
`agents/AGENTS.md` and then its role profile; it does not preload the rule
catalog. Capability selection reads `CAPABILITIES.md` then the matching route.
Atomic handoff work reads `HANDOFF_PROTOCOL.md`; acceptance routing reads
`VALIDATION.md`. A command-policy change reads
`rules/AGENTS.md` and the affected `.rules` file. A Serena launcher change
reads `scripts/AGENTS.md` and its launcher. README files provide routing and
rationale only; `AGENTS.md` contains the constraints that must apply during
work in that subtree. Candidate classification reads `catalog/AGENTS.md` and
the exact catalog JSON; it does not make a candidate role dispatchable.

## Six-layer agent architecture

The system separates six different concerns. A role is an accountable worker, a Skill is a reusable method, and validation is evidence rather than an implementation phase.

| Layer | Authoritative owner | Responsibility | Repository location |
| --- | --- | --- | --- |
| 1. Governance and contracts | Repository | Defines truth, authorization, architecture boundaries, and evidence invariants. | Root [AGENTS.md](../AGENTS.md), `architecture/`, `docs/rules/` |
| 2. Orchestration | Primary Codex | Selects the minimum work, delegates only independent uncertainty, preserves scope, and integrates the conclusion. | [ORCHESTRATION.md](ORCHESTRATION.md) |
| 3. Specialist roles | One `<role>.toml` profile | Performs one bounded, accountable responsibility and returns its stated deliverable. | [agents/](agents/README.md) |
| 4. Capabilities and transports | Installed Skill, MCP, CLI, or Plugin | Supplies a method or connection; availability never creates business ownership. | [CAPABILITIES.md](CAPABILITIES.md) |
| 5. Atomic work and handoff | Primary plus assigned role | States one goal, scope, inputs, invariants, deliverable, stop condition, and validation owner. | [WORKFLOWS.md](WORKFLOWS.md), [HANDOFF_PROTOCOL.md](HANDOFF_PROTOCOL.md) |
| 6. Evidence and acceptance | Validator, verifier, decider, or provider readback | Demonstrates only its evidence boundary; it cannot be replaced by a claim, static configuration, or deployment success. | [VALIDATION.md](VALIDATION.md) |

The normal evidence flow is `governance → orchestration → role → atomic work → evidence`. If a role discovers missing authority, an ambiguous owner, or an unverified premise, it returns to the earliest layer that can resolve the gap. It does not invent a contract or silently expand scope.

## Layer handoff contracts

The six layers are not a one-way hierarchy. They exchange a small, explicit
contract and return to the earliest owner of a missing fact.

| Handoff | Required input | Required output | Return path when insufficient |
| --- | --- | --- | --- |
| L1 → L2 | Business result, authoritative contracts, invariants, authorization boundary | Scoped task and applicable authorities | L1 when truth, policy, or ownership is ambiguous |
| L2 → L3 / L4 | Atomic task packet and only necessary capabilities | Selected role plus verified capability/connection status | L2 when scope, delegation, or capability selection is unresolved |
| L3 + L4 → L5 | Bounded specialist result and its tool evidence | Standard handoff result: facts, assumptions, deliverable, gaps, and evidence boundary | L3 for missing analysis; L4 for missing transport/tool evidence |
| L5 → L6 | Candidate revision, claim, acceptance criterion, and evidence plan | Separated static/test/browser/provider/deployment/device evidence | L2 when the claim or validation owner is unclear |
| L6 → L2 | Evidence outcome, exact revision/target, and unresolved gaps | Integrate, reject, or request the smallest earlier-layer correction | L1 for contract conflict; L3–L5 for a correctable evidence gap |

L5 is the interface layer, not an extra worker. Its packet/result schemas live
in [HANDOFF_PROTOCOL.md](HANDOFF_PROTOCOL.md). L6 proof routing lives in
[VALIDATION.md](VALIDATION.md), while exact proof limits
remain authoritatively defined by repository [validation rules](../docs/rules/validation-evidence.md).

## Operating principles

- A role owns one primary responsibility, not a product bounded context or an entire delivery lifecycle.
- Skills, MCPs, plugins, and commands are optional capabilities chosen to answer a concrete question inside the assigned boundary.
- Read-only analysis, writing, and validation remain separate responsibilities to preserve review independence and evidence integrity.
- Shared MCP configuration is inherited by the parent and agents. TOML role restrictions are behavioural limits, not an operating-system security boundary.
- External writes require real provider authorization, an exact target, and readback; neither this directory nor a role profile grants them.

For operational rules, role routing, and the command-output budget, read [.codex/AGENTS.md](AGENTS.md) and [agents/AGENTS.md](agents/AGENTS.md). Validate runtime changes with `pnpm tooling:check`; validate documentation links with `pnpm docs:check`.

## Approval architecture

This project supports approval-oriented sessions without turning every ordinary edit into a new product decision.

| Boundary | Owner | What it decides | What it cannot decide |
| --- | --- | --- | --- |
| Host sandbox and approval UI | Current Codex session / user policy | Whether a tool may read, write, or execute now | Repository business authority or provider authorization |
| `rules/*.rules` | Command-safety policy | Whether a matching shell command is routine (`allow`) or needs review (`prompt`) | Direct file-edit confirmations, MCP permissions, or external business writes |
| Task authorization | User request + Primary scope | Whether an assigned writer may make reversible changes in the stated scope | Bypass host policy, deploy, publish, mutate provider data, or widen product meaning |

Once the user has authorized a bounded repository change, the Primary does not request a second semantic confirmation for each reversible local edit. It still reports host-enforced prompts truthfully and pauses for unknown product semantics, destructive operations, external mutation, or a scope change.

## Folder documentation contract

Every direct `.codex/` child directory must have both `README.md` and
`AGENTS.md`. The README is its durable specification and must state:

| Required item | Purpose |
| --- | --- |
| Title and Owner | Names the bounded responsibility and the one authority for it. |
| Function and use | Explains what the directory does, when it is entered, and its non-goals. |
| Content catalog | Lists each maintained file with its primary role, caller/entry point, and effect boundary. |
| Naming and change rule | Prevents unclear names, duplicate owners, and accidental new categories. |
| Approval and validation | States which effects need host/provider confirmation and which checks demonstrate static correctness. |

`AGENTS.md` repeats none of that catalog. It contains only the local constraints
that must be loaded whenever work enters the directory. This keeps the active
instruction chain small while preserving a complete, reviewable specification.
