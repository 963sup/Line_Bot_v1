# Atomic specialist roles

**Layer coverage:** L3 Specialist roles and L5 Atomic work/handoff.

This directory is layer 3 of the [six-layer agent architecture](../README.md#six-layer-agent-architecture): it owns specialist role profiles and their human-readable routing. It does not own product architecture, provider authorization, Skills, MCP configuration, or the final product decision.

The executable role-routing contract is [AGENTS.md](AGENTS.md). Each TOML profile adds one bounded mission and inherits root plus nearest `AGENTS.md` rules.

## Function, use, and non-goals

Use this directory when a task has an independent specialist responsibility that
can return a bounded deliverable to Primary. A profile is not a workflow, a
tool, a product bounded context, or a permission bundle. Product Owner contracts
remain in the repository; Skills/MCPs remain capabilities selected at runtime.

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

### L5 handoff result schema

Every role returns the following compact record. This is the interface from L3
specialist work through L5 handoff to L6 evidence; it does not replace the role's
own required deliverable.

```text
Status: complete | needs-decision | blocked
Task / layer: <bounded goal> / L3→L5
Candidate: <revision and relevant working-tree state>
Verified facts: <evidence-backed observations>
Assumptions: <explicitly unverified premises>
Deliverable: <the role's bounded result>
Evidence boundary: <what this result proves and does not prove>
Unresolved / risk: <smallest remaining gap>
Next handoff: <L1–L6 destination and exact question>
```

`blocked` means a prerequisite prevents meaningful progress; it is not a label
for an inconvenient or incomplete analysis. The next handoff always targets the
earliest layer that owns the missing fact.

## Capability boundary

Skills, MCPs, plugins, and CLIs belong to layer 4. A profile may use them only when the current session exposes them and its instructions permit use. For example, `repository-mapper` may use Serena after semantic resolution is insufficient; that does not make Serena a separate role. Likewise, `validation-runner` owns bounded execution evidence, but not test design or acceptance.

High-volume commands follow the [routing and command-output protocol](#routing-and-command-output-protocol). Provider readback, browser/device evidence, local tests, static checks, and deployment are separate evidence types under the repository [validation rules](../../docs/rules/validation-evidence.md).

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

## Capability and approval matrix

| Need | Default role | Capability boundary |
| --- | --- | --- |
| Owner, contract, or consumer is unknown | Primary, then `repository-mapper` only if semantic resolution remains insufficient | Start with `pnpm semantic plan/context`; Serena is mapper-only supplementary exploration. |
| Bounded causal chain | `root-cause-analyst` | Repository evidence; Sentry read-only evidence only when supplied and available. |
| Architecture or data decision | `architecture-analyst`, `architecture-decider`, `supabase-postgresql-designer`, or `schema-transition-planner` | Design output only; no provider/schema mutation. |
| Already-decided local change | `change-implementer` | One write surface; follows task scope and host approval. |
| Concrete defect or specialised boundary review | Matching reviewer | Read-only diff/contract evidence; no implementation. |
| Synthetic browser-flow evidence | `browser-flow-verifier` | Reuses existing loopback Playwright scripts; evidence remains distinct from backend/device/provider proof. |
| Sentry incident evidence | `sentry-incident-diagnostician` | Uses only available read-only Sentry MCP observation; Sentry is not business truth. |
| Test design or bounded non-browser command execution | `test-designer` or `validation-runner` | Only `validation-runner` executes assigned non-browser high-output validation. |
| Framework/component/runtime investigation | `technical-researcher`, `component-researcher`, or `nextjs-runtime-diagnostician` | Use an actually available, task-matched official source or MCP; no assumed connection. |
| Evidence claim or acceptance | `evidence-verifier` or `acceptance-decider` | Assesses existing evidence; does not create it. |

Skills, MCPs, plugins, and CLIs are layer-4 capabilities. They are selected only when their prerequisites are present and their operation fits the role. They do not create a role, grant permission, or replace repository truth.

## Routing and command-output protocol

Primary is responsible for routing, not ceremony. Resolve scope directly when it is known; otherwise run `pnpm semantic plan`, and use `pnpm semantic context` only when exact selectors are needed. Delegate only an uncertainty that has an independent deliverable.

For high-output validation, the task packet explicitly assigns `validation-runner`, or `browser-flow-verifier` for a synthetic browser flow, with allowed/excluded commands, scope, side effects, and a stable label. The assigned runner selects relevant checks, runs authorized commands through `pnpm validation:run --label <label> -- <pnpm arguments>`, and returns only revision, command, exit code, duration, artifact path, and bounded failure evidence. Full logs remain in ignored artifacts. A role must never convert an `allow` command rule into product or provider authority.

## Model selection

Every project role uses GPT-5.6. Luna is the default for bounded mapping, documentation, evidence, validation, and acceptance work. Terra is used where the work needs deeper root-cause, architecture, implementation, review, data, or runtime reasoning. The model is a quality/cost choice, never a governance rank or permission grant.
