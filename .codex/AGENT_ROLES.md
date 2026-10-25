# Agent roles

**Owner:** L3 specialist-role taxonomy. **Audience:** Primary and role authors. **Type:** Reference.

One role owns one observable responsibility. A role is not a workflow, tool, permission bundle, or bounded context. Its executable declaration is one TOML profile in [`agents/`](agents/README.md); this document owns classification and selection vocabulary.

## Role families

| Family | Roles | Output boundary |
| --- | --- | --- |
| Locate / research | `repository-mapper`, `technical-researcher` | Bounded source/consumer map or verified external fact |
| Diagnose / analyse / decide | `root-cause-analyst`, `architecture-analyst`, `architecture-decider`, `performance-analyst` | Cause, options, or one evidence-backed decision |
| Design / plan | `supabase-postgresql-designer`, `schema-transition-planner`, `test-designer` | Design or plan, never its execution |
| Implement / document | `change-implementer`, `documentation-writer` | One decided write surface |
| Review | `diff-reviewer`, `authorization-reviewer`, `database-boundary-reviewer`, `accessibility-reviewer`, `github-actions-security-reviewer`, `dependency-supply-chain-reviewer` | Supported finding or clean bounded review |
| Diagnose specialist runtime | `nextjs-runtime-diagnostician`, `component-researcher`, `sentry-incident-diagnostician` | Bounded runtime/component/incident observation |
| Validate / prove / accept | `validation-runner`, `browser-flow-verifier`, `evidence-verifier`, `acceptance-decider` | Execution evidence, evidence assessment, or acceptance judgment |

## Selection rule

1. State the remaining question after L1/L2 scope resolution.
2. Select the narrowest role whose `Mission`, `Owns`, and `Deliverable` answer exactly that question.
3. If the role needs a command, MCP, or Skill, select its L4 route through [CAPABILITIES.md](CAPABILITIES.md).
4. Give it an L5 [task packet](HANDOFF_PROTOCOL.md#task-packet) and require the matching [handoff result](HANDOFF_PROTOCOL.md#handoff-result).
5. Do not combine analysis + implementation, implementation + review, or evidence creation + acceptance in the same role.

## Admission rule

Add a profile only when an existing role cannot complete the task without gaining a second primary responsibility, and the new role has independent input, deliverable, stop condition, evidence boundary, and real consumer. Otherwise improve routing, the task packet, or the L4 capability route.

Profile naming, model selection, exact profile catalog, and local constraints are maintained in [agents/README.md](agents/README.md) and [agents/AGENTS.md](agents/AGENTS.md). Atomic instruction requirements are in [ATOMIC_INSTRUCTIONS.md](ATOMIC_INSTRUCTIONS.md).
