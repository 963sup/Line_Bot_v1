# Codex runtime architecture

**Layer coverage:** L2 Orchestration and L4 Capabilities/transports. L1 and L6 are intentionally owned outside `.codex`; this document routes to their repository authorities.

`.codex/` owns local Codex runtime configuration and operational conventions. It is **not** a source of product behaviour, business facts, or external-platform authority. Product truth remains in the repository contracts, architecture inputs, source, schema, and tests named by the root [AGENTS.md](../AGENTS.md).

## Navigation

| Path | Layer | Owner | Purpose |
| --- | --- | --- | --- |
| [config.toml](config.toml) | L2 + L4 | Codex runtime configuration | Enables project agents and configures shared MCP transports. |
| [agents/](agents/README.md) | L3 + L5 | Agent-routing documentation and role profiles | Defines atomic specialist roles, their handoffs, and their TOML profiles. |
| [rules/](rules/) | L4 | Command-safety policy | Constrains shell command patterns; it does not authorize product or provider writes. |
| [scripts/](scripts/) | L4 | Codex support scripts | Supports runtime configuration only. |
| [AGENTS.md](AGENTS.md) | L2 + L4 | Runtime-scope instructions | Executable constraints and validation entry points. |

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

## Effective capability registry

Layer 4 records only a capability with a current consumer, a distinct decision it
can answer, and a bounded effect. Installed-but-unused tools are deliberately
absent: their presence neither improves routing nor grants authority.

| Capability | Concrete consumer | Use only when | What it produces | Boundary |
| --- | --- | --- | --- | --- |
| `pnpm semantic plan` / `pnpm semantic context` | Primary; `repository-mapper` when still needed | Owner, contract, consumer, or cross-owner impact is unresolved | Scoped authority selectors and repository navigation inputs | Query evidence; never mutation authority |
| `pnpm code` (`facts`, `definition`, `references`) | `repository-mapper` | A bounded symbol/import/export path needs static evidence after semantic resolution | Source-snapshot navigation evidence | Cannot prove runtime flow, business ownership, or full-repository coverage |
| `pnpm validation:run --label …` | `validation-runner`; `browser-flow-verifier` for its assigned flow | A task packet names commands, expected effects, and an evidence owner | Bounded command result and ignored full-log artifact | Validation is not design, provider readback, or acceptance |
| `pnpm docs:check`, `tooling:check`, `tooling:rules` | `documentation-writer`; `validation-runner` | Documentation or Codex runtime policy changed | Static documentation/runtime-policy evidence | Does not prove a new session loaded the configuration |
| Serena MCP | `repository-mapper` | Semantic and direct static queries leave a bounded stateful exploration gap | Read-only symbol navigation within this worktree | Supplementary only; not a role or business truth |
| Next DevTools MCP | `nextjs-runtime-diagnostician` | An explicit local Next.js port and matching checkout are available | Read-only runtime observation and installed-version documentation | Does not prove browser/user-flow acceptance |
| shadcn MCP | `component-researcher` | A UI composition/registry compatibility question is unresolved | Registry/project compatibility research | Never installs or authorizes generated changes |
| Sentry MCP | `sentry-incident-diagnostician` | An exact read-only incident/project/environment target is supplied | Exception event, release, and source-map correlation | Incident observation is not root-cause or business truth |
| `supabase` and `supabase-postgres-best-practices` Skills | `supabase-postgresql-designer`; `schema-transition-planner` | A bounded persistence design or transition needs current provider guidance | Read-only design/planning input | Not remote schema/data execution or migration history |
| `agentic-actions-auditor` and `github-actions` Skills | `github-actions-security-reviewer` | A GitHub Actions trust boundary is under review | Read-only workflow-security analysis input | Not CI execution, secret access, or workflow edits |
| `supply-chain-risk-auditor` Skill | `dependency-supply-chain-reviewer` | A manifest/lockfile candidate needs current provenance/advisory evidence | Read-only dependency-risk analysis input | Not dependency installation or runtime exploit proof |

Plugins are **not** a separate routing category. They distribute a Skill, MCP,
or app capability; record the actual consumed capability above (or in the role
profile), not a plugin name. Add a row only after a real role has a concrete
task it improves, its prerequisite can be checked, and its evidence boundary is
known. Remove the row when its last consumer is retired.

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
in [agents/README.md](agents/README.md); L6 proof boundaries remain
authoritatively defined by the repository [validation rules](../docs/rules/validation-evidence.md).

## L6 evidence routing index

This is a routing index, not a second acceptance policy. Exact proof limits are
owned by [validation rules](../docs/rules/validation-evidence.md).

| Claim requiring evidence | First evidence owner | Evidence that supports it | Does not prove |
| --- | --- | --- | --- |
| Markdown structure or local links | `documentation-writer` / `validation-runner` | `pnpm docs:check` | Product behavior or deployment |
| Source, contract, and transitive consumer correctness | Owner test + `validation-runner` | Selected `pnpm check` groups and relevant tests | Provider/device state |
| Declarative schema contract | Schema owner + `validation-runner` | `pnpm schema:check` | Remote Supabase state |
| Synthetic web flow | `browser-flow-verifier` | Loopback screenshot, trace, and browser script result | Backend persistence, provider login, or device acceptance |
| Unexpected runtime exception incident | `sentry-incident-diagnostician` | Read-only issue/event/release/source-map evidence | Root cause, business audit truth, or acceptance |
| Exact remote provider state | Assigned provider readback owner | Bounded provider/API readback | Unrelated business flow |
| Production deployment target/alias | Release/deployment owner | Exact SHA plus deployment/provider readback | Browser/device acceptance |
| Real device or physical environment | Explicit device acceptance owner | Observed device flow | Source/schema/provider correctness |

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
