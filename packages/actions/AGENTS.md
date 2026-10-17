# Actions constraints
Inherits [packages](../AGENTS.md). Authority: [Actions owner](../../docs/owners/actions.md).

- Project business automations are two fixed workflows. Project supplies current ADMIN/open lifecycle; WBS supplies source identity. Repository automation is R1 transfer-only. GitHub CI/SCM Workflow belongs to its separate reserved owner.
- Rule versions and accepted recipient snapshots are immutable; event acceptance freezes the entire fan-out.
- Every step rechecks current delegation, Project ADMIN/open lifecycle, rule enablement and live lease.
- Stable recipient intent keys survive replay, worker interruption and retry. Cancellation never claims to undo accepted effects.
- Application coordinates decisions through transaction/output ports; persistence owns locking and fencing.
