# Workflows

**Owner:** L5 atomic work sequencing. **Audience:** Primary and role authors. **Type:** Reference.

L5 does not impose a universal pipeline. It defines the minimum composition rules when independent work must cross a role boundary.

## Supported workflows

| Workflow | Use when | Required sequence |
| --- | --- | --- |
| Direct owner change | Owner, contract, and consumer are known | L1 → L2 → owner change → selected L6 evidence |
| Ambiguous repository change | Owner or consumer remains unknown | L1 → L2 → `semantic-scope` → L3 mapping/analysis → change/review → L6 |
| Architecture decision | Facts exist but a boundary/option must be chosen | L1 → L2 → analyst → decider → implementation (separate task) → L6 |
| Runtime incident | Exact target and observation problem exist | L1 → L2 → incident diagnostician + L4 preflight → root-cause analysis if warranted → change/review → L6 |
| Provider/data transition | Product policy and relation authority are known | L1 → L2 → data designer/planner → implementation/review → local and remote evidence kept separate |

## Composition rules

- A workflow creates no new role. It only orders existing atomic responsibilities.
- A cross-role workflow declares one `enabled` Atomic from the [catalog](catalog/README.md); its unique `executorRoleId` derives the executor. Direct owner work omits it. Candidate Atomics have no executor and are planning vocabulary only.
- A role receives one [task packet](HANDOFF_PROTOCOL.md#task-packet) and returns one [handoff result](HANDOFF_PROTOCOL.md#handoff-result).
- An L4 route is optional and may never authorize a provider write.
- A green check never skips L6 evidence selection.
- The next step is omitted when it cannot change the outcome.

The executable L5 contract is [HANDOFF_PROTOCOL.md](HANDOFF_PROTOCOL.md);
this document owns composition, not an additional directory layer.
