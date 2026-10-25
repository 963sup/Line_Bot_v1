# Atomic role constraints

**Layer scope:** L3 Specialist roles and L5 Atomic work/handoff.

Read [README.md](README.md) for the six-layer model, role index, capability matrix, role-profile contract, and detailed routing. This file contains only the constraints that apply whenever a role profile is used or changed.

- A profile owns exactly one primary responsibility. Its `Input`, `Owns`, `Deliverable`, and `Stop` fields must describe that same work. Do not add a profile unless an existing one cannot own the work without a second responsibility.
- Profile names use `l3-<subject>-<primary-role>-gpt-5.6-<luna|terra>.toml`; the `<subject>-<primary-role>` portion exactly matches TOML `name`. Use only the primary-role vocabulary documented in the README.
- Role profiles inherit root and parent constraints. They cannot grant shell approval, sandbox escape, MCP access, provider write authority, or an exception to repository contracts.
- Use [../AGENT_ROLES.md](../AGENT_ROLES.md) for role selection, [../ATOMIC_INSTRUCTIONS.md](../ATOMIC_INSTRUCTIONS.md) for profile/task construction, and [../HANDOFF_PROTOCOL.md](../HANDOFF_PROTOCOL.md) whenever work crosses a role boundary; load only the contract needed by the task.
- Primary resolves Owner/contract/consumer scope first. Use `pnpm semantic plan` and then `pnpm semantic context` when needed; use `repository-mapper` only for unresolved or genuinely stateful repository exploration.
- After role selection, any command, MCP, or Skill beyond direct owner/source reading must be selected from [../CAPABILITIES.md](../CAPABILITIES.md). Read the matching route, satisfy its preflight, and return its route ID plus reached state (`Declared`, `Eligible`, `Available`, `Executed`, or `Proven`) in the L5 handoff. Do not load the index for a known single-owner task with no L4 capability need.

## Autonomous delegation

Delegate only a bounded uncertainty whose independent result changes the decision or acceptance confidence. The Primary owns scope, authorization, integration, and final conclusion; it uses the fewest roles necessary and never delegates a role's decision back into another role without new evidence.

## Immediate role selection

| Need | Select |
| --- | --- |
| Semantic resolution remains ambiguous or needs bounded Serena exploration | `repository-mapper` |
| Bounded symptom has unknown cause | `root-cause-analyst` |
| Owner/truth/boundary decision | `architecture-analyst`; use `architecture-decider` only for an independent final choice |
| Current provider/framework/API fact | `technical-researcher` |
| Decided bounded repository change | `change-implementer` |
| Concrete diff or specialised risk review | Matching reviewer (`diff`, `authorization`, `database-boundary`, `accessibility`, `github-actions-security`, or `dependency-supply-chain`) |
| Data design or declarative transition | `supabase-postgresql-designer` or `schema-transition-planner` |
| Next.js runtime / component compatibility | `nextjs-runtime-diagnostician` or `component-researcher` |
| Synthetic browser-flow evidence | `browser-flow-verifier` |
| Sentry incident evidence | `sentry-incident-diagnostician` |
| Test design / assigned non-browser validation execution | `test-designer` or `validation-runner` |
| Sync decided facts / verify evidence / decide acceptance | `documentation-writer`, `evidence-verifier`, or `acceptance-decider` |

Read the selected profile for its exact scope; read [README.md](README.md) only when a role is new, selection remains unclear, or capability/approval detail affects the decision.

- A delegated packet must state goal, allowed/excluded scope, inputs/revision, invariants, deliverable, stop condition, and validation owner. A child reports a gap instead of expanding scope or delegating again.
- One writer owns one write surface. Read-only analysis does not run broad validation or make edits; validation evidence does not replace design, implementation, provider readback, or acceptance.
- High-output commands are assigned only to `validation-runner`, or to `browser-flow-verifier` for its assigned browser flow, with the bounded-output protocol described in the README. Record revision, command, exit code, duration, artifact path, and bounded failure evidence.
- Validate profile/routing changes with `pnpm tooling:check`; validate links with `pnpm docs:check`. Role discovery or static success does not prove a live session reloaded configuration.
