# Resources

This package owns Repository-scoped physical `LOCATION`, `EQUIPMENT` and `MATERIAL` identities.
Resources have an explicit immutable kind, versioned name and description, an
`ACTIVE | ARCHIVED` lifecycle, immutable revisions and durable command receipts.

The public reference reader verifies current Repository access and returns exact physical Resource
revision bases in caller order. Content and Execution use that contract for frozen physical Resource
pins without acquiring Resource authority.

The former Object, Object Type, quantity, relationship and engineering model has been retired. It is
not a compatibility surface for physical Resources.

Read the [owner contract](../../docs/owners/resources.md), [local constraints](AGENTS.md) and generated
[semantics](SEMANTICS.md) for the current responsibility and public contracts.
