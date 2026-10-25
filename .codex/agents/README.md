# Atomic specialist roles

**Layer coverage:** L3 Specialist roles and L5 Atomic work/handoff.

This directory is layer 3 of the [six-layer agent architecture](../README.md#six-layer-agent-architecture): it owns specialist role profiles and their human-readable routing. It does not own product architecture, provider authorization, Skills, MCP configuration, or the final product decision.

The executable role-routing contract is [AGENTS.md](AGENTS.md). Each TOML profile adds one bounded mission and inherits root plus nearest `AGENTS.md` rules.

[../AGENT_ROLES.md](../AGENT_ROLES.md) owns role taxonomy/selection and
[../ATOMIC_INSTRUCTIONS.md](../ATOMIC_INSTRUCTIONS.md) owns atomic instruction
construction; this README owns directory-level profile catalog and naming.

## Function, use, and non-goals

Use this directory when a task has an independent specialist responsibility that
can return a bounded deliverable to Primary. A profile is not a workflow, a
tool, a product bounded context, or a permission bundle. Product Owner contracts
remain in the repository; Skills/MCPs remain capabilities selected at runtime.

## Role profile convention

Each file uses this naming shape:

```text
l3-<subject>-<primary-role>-gpt-5.6-<luna|terra>.toml
```

`<primary-role>` describes one kind of work—such as `analyst`, `reviewer`, `designer`, `implementer`, `runner`, `verifier`, or `decider`. The subject narrows that work without creating a second responsibility. A model is selected for the bounded job, not as an authority hierarchy.

## Current role groups

| Atomic responsibility | Profiles |
| --- | --- |
| Locate a bounded owner, source, or consumer path | `repository-mapper`, `technical-researcher` |
| Explain cause or choose a boundary/design | `root-cause-analyst`, `architecture-analyst`, `architecture-decider`, `supabase-postgresql-designer`, `schema-transition-planner`, `performance-analyst` |
| Make one already-decided change | `change-implementer`, `documentation-writer` |
| Design tests or execute an assigned validation plan | `test-designer`, `validation-runner`, `browser-flow-verifier` |
| Review a bounded risk or concrete diff | `diff-reviewer`, `authorization-reviewer`, `database-boundary-reviewer`, `accessibility-reviewer`, `github-actions-security-reviewer`, `dependency-supply-chain-reviewer` |
| Diagnose a specialised runtime or component question | `nextjs-runtime-diagnostician`, `component-researcher`, `sentry-incident-diagnostician` |
| Verify evidence or make final acceptance judgment | `evidence-verifier`, `acceptance-decider` |

The list is an index, not a substitute for each profile's `Mission`, `Owns`, `Must Not`, `Deliverable`, and `Stop` fields.

## Role catalog

| Profile | Function | Use when | Must not own |
| --- | --- | --- | --- |
| `repository-mapper` | Locate unresolved Owner, contract, and consumers | Semantic resolution is ambiguous/incomplete or needs bounded Serena exploration | Architecture decision or edits |
| `root-cause-analyst` | Trace symptom to earliest evidenced trigger | A bounded symptom has unknown cause | Patch implementation or final redesign |
| `architecture-analyst` | Analyse Owner, truth, boundary, and dependency | A structural decision needs options and invariants | Final decision or code edits |
| `architecture-decider` | Make one independent architecture decision from evidence | Options and trade-offs are already evidenced | Further investigation or implementation |
| `technical-researcher` | Verify one current provider/framework/API fact | Local evidence cannot establish an external technical fact | Repository design or source edits |
| `change-implementer` | Apply one decided bounded change | Scope, contract, and acceptance are decided | Re-deciding scope or reviewing own diff |
| `diff-reviewer` | Find concrete correctness/regression defects in a diff | A candidate change needs independent review | Editing or broad validation reruns |
| `authorization-reviewer` | Review actor/scope/tenant isolation boundary | Diff changes authorization behaviour | Generic code-quality review |
| `database-boundary-reviewer` | Review schema/RLS/transaction boundary | Diff changes persistence safety | Schema design or remote mutation |
| `supabase-postgresql-designer` | Design relation/RLS/index/recovery boundary | A data design decision is needed | Applying schema or migration history |
| `schema-transition-planner` | Plan declarative cutover/recovery | A schema/data transition is decided in principle | Applying remote schema changes |
| `github-actions-security-reviewer` | Review workflow trigger/secret/artifact trust | GitHub Actions boundary changes | Running CI or editing workflows |
| `dependency-supply-chain-reviewer` | Review provenance/reachability/advisory risk | Manifest or lockfile risk needs assessment | Installing packages or editing manifests |
| `accessibility-reviewer` | Review accessible UI contract | UI change requires accessibility evidence | UI implementation |
| `nextjs-runtime-diagnostician` | Diagnose one live Next.js runtime symptom | Correct checkout and runtime port are available | Starting/stopping server or patching source |
| `component-researcher` | Research component/registry compatibility | UI composition choice is unresolved | Installing or editing components |
| `browser-flow-verifier` | Execute one synthetic browser flow and preserve visual/trace evidence | Browser flow acceptance needs loopback evidence | Source edits, backend proof, provider login, or device acceptance |
| `sentry-incident-diagnostician` | Diagnose one read-only Sentry incident | Production exception evidence needs bounded timeline/source correlation | Telemetry changes, provider writes, or final root-cause claim |
| `performance-analyst` | Analyse one measured performance bottleneck | Measurement evidence exists | Performance implementation without decision |
| `test-designer` | Design tests for decided behaviour | Behaviour/contract is known but test cases are not | Running broad test suites or product edits |
| `validation-runner` | Execute one assigned validation plan with bounded output | Commands, scope, and expected effects are explicit | Test design, architecture decision, or source edits |
| `documentation-writer` | Synchronize already-decided facts into docs | Source/contract evidence is available | Inventing product behaviour |
| `evidence-verifier` | Check whether a claim is supported by evidence | Candidate revision and evidence are available | Creating the evidence or deciding acceptance |
| `acceptance-decider` | Decide a high-risk acceptance from complete evidence | Acceptance criteria and exact revision are explicit | Running tests or implementation |

## Capability boundary

Skills, MCPs, plugins, and CLIs belong to layer 4. A profile may use them only when the current session exposes them and its instructions permit use. For example, `repository-mapper` may use Serena after semantic resolution is insufficient; that does not make Serena a separate role. Likewise, `validation-runner` owns bounded execution evidence, but not test design or acceptance.

The complete, consumer-based capability registry is maintained in
[CAPABILITIES.md](../CAPABILITIES.md). A profile names a capability again only
when its mission needs additional role-specific preconditions or prohibitions;
it must not create a second catalog.

Atomic task packets, handoff records, and high-volume command output belong to
[HANDOFF_PROTOCOL.md](../HANDOFF_PROTOCOL.md). Provider readback, browser/device
evidence, local tests, static checks, and deployment are separately routed by
[VALIDATION.md](../VALIDATION.md).

## Adding or changing a profile

Add a role only when all conditions hold:

- it has an independent input, deliverable, stop condition, and evidence boundary;
- an existing profile cannot naturally own the work without gaining a second responsibility;
- its scope and permitted capability use are explicit; and
- it does not obtain provider-write authority through the profile.

Otherwise, improve routing or a task packet instead of adding another agent. Changes to this directory require `pnpm tooling:check`; documentation-link changes also require `pnpm docs:check`.

## Naming policy

Allowed primary-role suffixes are `mapper`, `analyst`, `researcher`, `planner`, `designer`, `implementer`, `reviewer`, `runner`, `verifier`, `decider`, `writer`, and `diagnostician`. Do not use `worker`, a tool name, a model version, or a historical batch label as a role name.

`<subject>` names the bounded object of work, not an organizational team or a
tool. For example, `database-boundary-reviewer` is valid because the review
subject is a boundary; `serena-agent` is invalid because Serena is a capability,
not an owned responsibility.

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

Every project role uses GPT-5.6. Luna is the default for bounded mapping, documentation, evidence, validation, and acceptance work. Terra is used where the work needs deeper root-cause, architecture, implementation, review, data, or runtime reasoning. The model is a quality/cost choice, never a governance rank or permission grant.
