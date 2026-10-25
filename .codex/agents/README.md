# Atomic specialist roles

**Layer coverage:** L3 Specialist roles and L5 Atomic work/handoff.

This directory is layer 3 of the [six-layer agent architecture](../README.md#six-layer-agent-architecture): it owns the small set of executor profiles and their shared runtime boundaries. Specialised task rules live in enabled catalog Atomics. It does not own product architecture, provider authorization, Skills, MCP configuration, or the final product decision.

The executable role-routing contract is [AGENTS.md](AGENTS.md). Each TOML profile adds one bounded mission and inherits root plus nearest `AGENTS.md` rules.

[../AGENT_ROLES.md](../AGENT_ROLES.md) owns role taxonomy/selection and
[../ATOMIC_INSTRUCTIONS.md](../ATOMIC_INSTRUCTIONS.md) owns atomic instruction
construction; this README owns directory-level profile catalog and naming.

## Function, use, and non-goals

Use this directory when a cross-role task needs an executor. Primary selects an
enabled Atomic first; its `executorRoleId` selects one profile here. A profile
is not a workflow, a specialised task taxonomy, a tool, a product bounded
context, or a permission bundle.

## Role profile convention

Each file uses this naming shape:

```text
l3-<subject>-<primary-role>-gpt-5.6-<luna|terra>.toml
```

`<primary-role>` describes one kind of work—such as `analyst`, `reviewer`, `designer`, `implementer`, `runner`, `verifier`, or `decider`. The subject narrows that work without creating a second responsibility. A model is selected for the bounded job, not as an authority hierarchy.

## Current role groups

| Atomic responsibility | Profiles |
| --- | --- |
| Establish one fact | `investigator` |
| Analyse one bounded question | `analyst` |
| Make one independent decision | `decider` |
| Apply one decided change | `change-implementer` |
| Review one candidate | `reviewer` |
| Observe one runtime condition | `runtime-diagnostician` |
| Execute one assigned validation | `validation-runner` |

The list is an index, not a substitute for each profile's `Mission`, `Owns`, `Must Not`, `Deliverable`, and `Stop` fields.

## Executor catalog

| Profile | Function | Use when | Must not own |
| --- | --- | --- | --- |
| `investigator` | Establish one source-backed fact | An enabled investigation Atomic is selected | Decision, edits, review, or validation |
| `analyst` | Produce options or a plan | An enabled analysis/design Atomic is selected | Final decision or implementation |
| `decider` | Make one independent decision | An enabled decision Atomic has complete evidence | Investigation, implementation, or validation |
| `change-implementer` | Apply one decided write | An enabled implementation Atomic is selected | Reviewing or accepting its own change |
| `reviewer` | Find concrete candidate defects | An enabled review Atomic is selected | Editing, broad validation, or acceptance |
| `runtime-diagnostician` | Observe one runtime condition | An enabled diagnostic Atomic and target are supplied | Patching, restarts, provider writes, or root-cause claims |
| `validation-runner` | Execute bounded validation evidence | An enabled validation Atomic and command/flow are supplied | Implementation or acceptance |

## Capability boundary

Skills, MCPs, plugins, and CLIs belong to layer 4. A profile may use them only when the current session exposes them and its instructions permit use. For example, `investigator` may use Serena after semantic resolution is insufficient; that does not make Serena a separate role. Likewise, `validation-runner` owns bounded execution evidence, but not test design or acceptance.

The complete, consumer-based capability registry is maintained in
[CAPABILITIES.md](../CAPABILITIES.md). A profile names a capability again only
when its mission needs additional role-specific preconditions or prohibitions;
it must not create a second catalog.

Atomic task packets, handoff records, and high-volume command output belong to
[HANDOFF_PROTOCOL.md](../HANDOFF_PROTOCOL.md). Provider readback, browser/device
evidence, local tests, static checks, and deployment are separately routed by
[VALIDATION.md](../VALIDATION.md).

## Adding or changing a profile

Add an executor only when all conditions hold:

- no existing executor can perform the Atomic without crossing an effect boundary;
- it has an independent execution boundary, input, deliverable, stop condition, and evidence boundary;
- its scope and permitted capability use are explicit; and
- it does not obtain provider-write authority through the profile.

Otherwise, add or improve an Atomic instead of adding another agent. Changes to this directory require `pnpm tooling:check`; documentation-link changes also require `pnpm docs:check`.

## Naming policy

Allowed primary-role suffixes are `mapper`, `analyst`, `researcher`, `planner`, `designer`, `implementer`, `reviewer`, `runner`, `verifier`, `decider`, `writer`, and `diagnostician`. Do not use `worker`, a tool name, a model version, or a historical batch label as a role name.

`<subject>` names the execution boundary, not an organizational team or a
tool. For example, `runtime-diagnostician` is valid because runtime observation
is an execution boundary; `serena-agent` is invalid because Serena is a
capability, not an owned responsibility.

## Profile contract

There is deliberately no `template.toml` file: Codex discovers TOML files in this directory as role profiles, so a template would be a malformed or accidentally selectable role. Copy this skeleton into a new correctly named profile instead:

```toml
# Model: GPT-5.6 Terra (gpt-5.6-terra)
name = "<subject>-<primary-role>"
description = "One bounded responsibility and its output."
model = "gpt-5.6-terra"
model_reasoning_effort = "high"
sandbox_mode = "read-only"
developer_instructions = """
Follow root AGENTS.md and .codex/agents/AGENTS.md.

[Mission]
One observable responsibility.

[Input]
The supplied question, scope, evidence, and invariants.

[Owns]
Only the work named by Mission.

[Must]
State verified facts, assumptions, and evidence boundary.

[Must Not]
List prohibited writes, authority changes, or adjacent responsibilities.

[Deliverable]
The exact bounded result returned to Primary.

[Stop]
Return when the deliverable is complete or a stated prerequisite is missing.

[Validation]
How the result avoids unsupported claims.
"""
```

`sandbox_mode` and profile instructions express intended behaviour. The actual sandbox, approval policy, provider connection, and MCP availability are inherited from the parent session; a TOML profile cannot relax them.

## Model selection

Every project role uses GPT-5.6. Luna is used for bounded investigation and validation; Terra is used for analysis, decisions, implementation, review, and runtime diagnosis. The model is a quality/cost choice, never a governance rank or permission grant.
