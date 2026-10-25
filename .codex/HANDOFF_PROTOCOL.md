# Handoff protocol

**Owner:** L5 interchange contract. **Audience:** Primary and every assigned role. **Type:** Reference.

Use this protocol whenever work moves between Primary, a role, and validation. It prevents hidden assumptions from becoming unstated scope expansion.

## Task packet

| Field | Required meaning |
| --- | --- |
| `goal` | One observable question or result |
| `scope` | Allowed/excluded paths, Owners, and provider boundaries |
| `inputs` | Candidate revision/WIP and already verified evidence |
| `invariants` | Contracts that must not be weakened |
| `deliverable` | Exact decision, change, finding, or evidence summary |
| `stopCondition` | When to return rather than broaden work |
| `validationOwner` | Who creates or assesses the next evidence |

The machine-readable form is [task-packet.schema.json](schemas/task-packet.schema.json).

## Handoff result

| Field | Required meaning |
| --- | --- |
| `status` | `complete`, `needs-decision`, or `blocked` |
| `taskLayer` | Bounded goal plus producing layer |
| `candidate` | Revision and relevant working-tree state |
| `verifiedFacts` / `assumptions` | Facts separated from unverified premises |
| `route` | L4 route ID + highest reached capability state, or `none` |
| `deliverable` | The role's bounded output |
| `evidenceBoundary` | What the output proves and does not prove |
| `unresolvedRisk` | Smallest remaining gap |
| `nextHandoff` | Earliest L1–L6 destination and exact question |

The machine-readable form is [handoff-result.schema.json](schemas/handoff-result.schema.json).

## Rules

- `blocked` requires a real missing prerequisite, not incomplete effort.
- A role reports a gap rather than changes another role's responsibility.
- High-output execution additionally returns command, exit code, duration, and ignored artifact path; full logs are not handoff payload.
- The protocol never grants an external write, changes a contract, or accepts a product outcome.

See [WORKFLOWS.md](WORKFLOWS.md) for sequencing and [VALIDATION.md](VALIDATION.md) for the next evidence owner.
