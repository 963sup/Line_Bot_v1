# Atomic role constraints

**Layer scope:** L3 Specialist roles and L5 Atomic work/handoff.

Read [README.md](README.md) for the six-layer model, role index, capability matrix, role-profile contract, and detailed routing. This file contains only the constraints that apply whenever a role profile is used or changed.

- A profile owns one execution boundary. Its domain-specific mission, input, Must/Must Not, deliverable, and stop condition come from the selected enabled Atomic. Do not add a profile unless no existing execution boundary can safely perform the Atomic.
- Profile names use `l3-<subject>-<primary-role>-gpt-5.6-<luna|terra>.toml`; the `<subject>-<primary-role>` portion exactly matches TOML `name`. Use only the primary-role vocabulary documented in the README.
- Role profiles inherit root and parent constraints. They cannot grant shell approval, sandbox escape, MCP access, provider write authority, or an exception to repository contracts.
- Use [../AGENT_ROLES.md](../AGENT_ROLES.md) for role selection, [../ATOMIC_INSTRUCTIONS.md](../ATOMIC_INSTRUCTIONS.md) for profile/task construction, and [../HANDOFF_PROTOCOL.md](../HANDOFF_PROTOCOL.md) whenever work crosses a role boundary; load only the contract needed by the task.
- Primary resolves Owner/contract/consumer scope first. Use `pnpm semantic plan` and then `pnpm semantic context` when needed; use `investigator` only for unresolved or genuinely stateful repository exploration.
- After role selection, any command, MCP, or Skill beyond direct owner/source reading must be selected from [../CAPABILITIES.md](../CAPABILITIES.md). Read the matching route, satisfy its preflight, and return its route ID plus reached state (`Declared`, `Eligible`, `Available`, `Executed`, or `Proven`) in the L5 handoff. Do not load the index for a known single-owner task with no L4 capability need.

## Autonomous delegation

Delegate only a bounded uncertainty whose independent result changes the decision or acceptance confidence. The Primary owns scope, authorization, integration, and final conclusion; it uses the fewest roles necessary and never delegates a role's decision back into another role without new evidence.

## Immediate role selection

| Need | Select |
| --- | --- |
| Owner, source, consumer, or external technical fact | `investigator` |
| Cause, boundary, design, transition, or test-plan analysis | `analyst` |
| Independent architecture or acceptance decision | `decider` |
| Decided bounded repository change | `change-implementer` |
| Concrete diff or specialised risk review | `reviewer` |
| Next.js or Sentry runtime observation | `runtime-diagnostician` |
| Command, browser-flow, or evidence-claim validation | `validation-runner` |

Read the selected profile for its exact scope; read [README.md](README.md) only when a role is new, selection remains unclear, or capability/approval detail affects the decision.

- A delegated packet must state goal, allowed/excluded scope, inputs/revision, invariants, deliverable, stop condition, and validation owner. A child reports a gap instead of expanding scope or delegating again.
- For every cross-role packet/result, select exactly one `enabled` [`atomicId`](../catalog/atomic-catalog.json), derive its unique `executorRoleId`, and echo the Atomic in both artifacts. A `candidate` Atomic has no executor, cannot be dispatched or selected as a route, and cannot obtain a capability.
- One writer owns one write surface. Read-only analysis does not run broad validation or make edits; validation evidence does not replace design, implementation, provider readback, or acceptance.
- High-output commands and browser flows are assigned only to `validation-runner` through an enabled validation Atomic. Record revision, command, exit code, duration, artifact path, and bounded failure evidence.
- Validate profile/routing changes with `pnpm tooling:check`; validate links with `pnpm docs:check`. Role discovery or static success does not prove a live session reloaded configuration.
