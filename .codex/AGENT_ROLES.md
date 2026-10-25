# Agent roles

**Owner:** L3 specialist-role taxonomy. **Audience:** Primary and role authors. **Type:** Reference.

One executor role owns one effect boundary. A role is not a workflow, tool, permission bundle, or bounded context. The selected enabled Atomic owns the domain-specific responsibility; its executor profile in [`agents/`](agents/README.md) owns the runtime boundary.

## Role families

| Family | Roles | Output boundary |
| --- | --- | --- |
| Investigate | `investigator` | One verifiable fact or explicit evidence gap |
| Analyse | `analyst` | Options or a plan, never a final decision or execution |
| Decide | `decider` | One independent architecture or acceptance decision |
| Implement | `change-implementer` | One decided write surface |
| Review | `reviewer` | Supported finding or clean bounded review |
| Diagnose runtime | `runtime-diagnostician` | Bounded runtime/incident observation |
| Validate | `validation-runner` | Bounded command, browser, or evidence assessment |

## Selection rule

1. State the remaining question after L1/L2 scope resolution.
2. For cross-role work, select the narrowest `enabled` Atomic from the [catalog](catalog/atomic-catalog.json). Its unique `executorRoleId` selects the profile; candidates have no executor and are not dispatchable.
3. If the Atomic requires a command, MCP, or Skill, select its L4 route through [CAPABILITIES.md](CAPABILITIES.md).
4. Give the derived executor an L5 [task packet](HANDOFF_PROTOCOL.md#task-packet) with `atomicId` and require the matching [handoff result](HANDOFF_PROTOCOL.md#handoff-result).
5. Do not combine analysis + implementation, implementation + review, or evidence creation + acceptance in the same Atomic/executor handoff.

## Admission rule

Add a profile only when no existing executor can perform an Atomic without crossing a write, review, validation, decision, or runtime-observation boundary. Otherwise add or improve an Atomic.

Profile naming, model selection, exact profile catalog, and local constraints are maintained in [agents/README.md](agents/README.md) and [agents/AGENTS.md](agents/AGENTS.md). Atomic instruction requirements are in [ATOMIC_INSTRUCTIONS.md](ATOMIC_INSTRUCTIONS.md).

## Candidate taxonomy

[catalog/role-catalog.json](catalog/role-catalog.json) is the complete role taxonomy. It keeps future and retired responsibility labels visible without making them dispatchable. Only an `enabled` entry with a real profile is an executor; specialised former profiles are `retired` when absorbed by an enabled Atomic.
