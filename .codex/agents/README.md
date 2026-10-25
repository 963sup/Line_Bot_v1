# Atomic specialist roles

This directory is layer 3 of the [six-layer agent architecture](../README.md#six-layer-agent-architecture): it owns specialist role profiles and their human-readable routing. It does not own product architecture, provider authorization, Skills, MCP configuration, or the final product decision.

The executable role-routing contract is [AGENTS.md](AGENTS.md). Each TOML profile adds one bounded mission and inherits root plus nearest `AGENTS.md` rules.

## Role profile convention

Each file uses this naming shape:

```text
gpt-5.6-<luna|terra>-<subject>-<primary-role>.toml
```

`<primary-role>` describes one kind of work—such as `analyst`, `reviewer`, `designer`, `implementer`, `runner`, `verifier`, or `decider`. The subject narrows that work without creating a second responsibility. A model is selected for the bounded job, not as an authority hierarchy.

## Current role groups

| Atomic responsibility | Profiles |
| --- | --- |
| Locate a bounded owner, source, or consumer path | `repository-mapper`, `technical-researcher` |
| Explain cause or choose a boundary/design | `root-cause-analyst`, `architecture-analyst`, `architecture-decider`, `supabase-postgresql-designer`, `schema-transition-planner`, `performance-analyst` |
| Make one already-decided change | `change-implementer`, `documentation-writer` |
| Design tests or execute an assigned validation plan | `test-designer`, `validation-runner` |
| Review a bounded risk or concrete diff | `diff-reviewer`, `authorization-reviewer`, `database-boundary-reviewer`, `accessibility-reviewer`, `github-actions-security-reviewer`, `dependency-supply-chain-reviewer` |
| Diagnose a specialised runtime or component question | `nextjs-runtime-diagnostician`, `component-researcher` |
| Verify evidence or make final acceptance judgment | `evidence-verifier`, `acceptance-decider` |

The list is an index, not a substitute for each profile's `Mission`, `Owns`, `Must Not`, `Deliverable`, and `Stop` fields.

## Atomic task packet and handoff

The Primary gives a role only the information needed to complete one unit of work. A valid packet contains:

1. **Goal** — one observable question or result.
2. **Scope** — allowed and excluded paths, owners, and provider boundaries.
3. **Inputs** — candidate revision/WIP and already-established evidence.
4. **Invariants** — contracts that cannot be weakened.
5. **Deliverable** — the exact decision, change, review finding, or evidence summary expected.
6. **Stop condition** — when to return rather than broaden the task.
7. **Validation owner** — who will execute or assess the resulting evidence.

The standard sequence is not a mandatory pipeline:

```text
resolve facts → analyse/decide → change → review/validate → verify acceptance
```

Only take a stage when it resolves an independent uncertainty. A role hands back facts, assumptions, revision, scope, evidence boundary, and unresolved items. It must not silently perform another role's write, remote mutation, final architecture decision, or validation run.

## Capability boundary

Skills, MCPs, plugins, and CLIs belong to layer 4. A profile may use them only when the current session exposes them and its instructions permit use. For example, `repository-mapper` may use Serena after semantic resolution is insufficient; that does not make Serena a separate role. Likewise, `validation-runner` owns bounded execution evidence, but not test design or acceptance.

High-volume commands follow the bounded-output protocol in [AGENTS.md](AGENTS.md#command-output-protocol). Provider readback, browser/device evidence, local tests, static checks, and deployment are separate evidence types under the repository [validation rules](../../docs/rules/validation-evidence.md).

## Adding or changing a profile

Add a role only when all conditions hold:

- it has an independent input, deliverable, stop condition, and evidence boundary;
- an existing profile cannot naturally own the work without gaining a second responsibility;
- its scope and permitted capability use are explicit; and
- it does not obtain provider-write authority through the profile.

Otherwise, improve routing or a task packet instead of adding another agent. Changes to this directory require `pnpm tooling:check`; documentation-link changes also require `pnpm docs:check`.
