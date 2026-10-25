# Agent interchange JSON Schemas

**Owner:** Machine-readable L4/L5/L6 interchange shapes. These schemas make the cross-role contract inspectable without duplicating repository/product truth.

| Schema | Owner document | Producer → consumer |
| --- | --- | --- |
| [task-packet.schema.json](task-packet.schema.json) | [HANDOFF_PROTOCOL.md](../HANDOFF_PROTOCOL.md) | Primary → assigned role |
| [handoff-result.schema.json](handoff-result.schema.json) | [HANDOFF_PROTOCOL.md](../HANDOFF_PROTOCOL.md) | Assigned role → Primary / L6 |
| [capability-route.schema.json](capability-route.schema.json) | [CAPABILITIES.md](../CAPABILITIES.md) | L2/L3 selection → L4 route |
| [evidence-plan.schema.json](evidence-plan.schema.json) | [VALIDATION.md](../VALIDATION.md) | Primary → evidence owner |

The schemas are optional machine representations of explicit task artifacts; they do not require every simple local change to serialize JSON. Read [AGENTS.md](AGENTS.md) before changing them.
