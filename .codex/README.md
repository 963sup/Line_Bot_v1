# Codex runtime architecture

`.codex/` owns local Codex runtime configuration and operational conventions. It is **not** a source of product behaviour, business facts, or external-platform authority. Product truth remains in the repository contracts, architecture inputs, source, schema, and tests named by the root [AGENTS.md](../AGENTS.md).

## Navigation

| Path | Owner | Purpose |
| --- | --- | --- |
| [config.toml](config.toml) | Codex runtime configuration | Enables project agents and configures shared MCP transports. |
| [agents/](agents/README.md) | Agent-routing documentation and role profiles | Defines atomic specialist roles, their handoffs, and their TOML profiles. |
| [rules/](rules/) | Command-safety policy | Constrains shell command patterns; it does not authorize product or provider writes. |
| [scripts/](scripts/) | Codex support scripts | Supports runtime configuration only. |
| [AGENTS.md](AGENTS.md) | Runtime-scope instructions | Executable constraints and validation entry points. |

## Context-loading policy

Load the smallest node that owns the decision. An agent-profile change reads
`agents/AGENTS.md` and then its role profile; it does not preload the rule
catalog. A command-policy change reads `rules/AGENTS.md` and the affected
`.rules` file. A Serena launcher change reads `scripts/AGENTS.md` and its
launcher. README files provide routing and rationale only; `AGENTS.md` contains
the constraints that must apply during work in that subtree.

## Six-layer agent architecture

The system separates six different concerns. A role is an accountable worker, a Skill is a reusable method, and validation is evidence rather than an implementation phase.

| Layer | Authoritative owner | Responsibility | Repository location |
| --- | --- | --- | --- |
| 1. Governance and contracts | Repository | Defines truth, authorization, architecture boundaries, and evidence invariants. | Root [AGENTS.md](../AGENTS.md), `architecture/`, `docs/rules/` |
| 2. Orchestration | Primary Codex | Selects the minimum work, delegates only independent uncertainty, preserves scope, and integrates the conclusion. | `config.toml` developer instructions; [development workflow](../docs/reference/engineering/development-workflow.md) |
| 3. Specialist roles | One `<role>.toml` profile | Performs one bounded, accountable responsibility and returns its stated deliverable. | [agents/](agents/README.md) |
| 4. Capabilities and transports | Installed Skill, MCP, CLI, or Plugin | Supplies a method or connection; availability never creates business ownership. | `config.toml`, installed skills, actual session tools |
| 5. Atomic work and handoff | Primary plus assigned role | States one goal, scope, inputs, invariants, deliverable, stop condition, and validation owner. | [agents/AGENTS.md](agents/AGENTS.md) |
| 6. Evidence and acceptance | Validator, verifier, decider, or provider readback | Demonstrates only its evidence boundary; it cannot be replaced by a claim, static configuration, or deployment success. | [validation rules](../docs/rules/validation-evidence.md) |

The normal evidence flow is `governance → orchestration → role → atomic work → evidence`. If a role discovers missing authority, an ambiguous owner, or an unverified premise, it returns to the earliest layer that can resolve the gap. It does not invent a contract or silently expand scope.

## Operating principles

- A role owns one primary responsibility, not a product bounded context or an entire delivery lifecycle.
- Skills, MCPs, plugins, and commands are optional capabilities chosen to answer a concrete question inside the assigned boundary.
- Read-only analysis, writing, and validation remain separate responsibilities to preserve review independence and evidence integrity.
- Shared MCP configuration is inherited by the parent and agents. TOML role restrictions are behavioural limits, not an operating-system security boundary.
- External writes require real provider authorization, an exact target, and readback; neither this directory nor a role profile grants them.

For operational rules, role routing, and the command-output budget, read [.codex/AGENTS.md](AGENTS.md) and [agents/AGENTS.md](agents/AGENTS.md). Validate runtime changes with `pnpm tooling:check`; validate documentation links with `pnpm docs:check`.
