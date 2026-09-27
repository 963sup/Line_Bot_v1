# @line_bot_v1/namespace
Owner: global Account Namespace naming, claim, resolution, rename, root reservation, and URL topology. Semantics: [Namespace](../../docs/owners/namespace.md).

- `src/domain/root.ts` is the executable truth for global root reserved keys; `src/domain/namespace.ts` owns global Account login normalization.
- `src/domain/routes.ts` owns the structured cross-owner URL contract: scope, locator owner, path shape and active/planned state. Web consumes its typed path builder; Next pages remain delivery-owned.
- `NamespaceStore` owns the global User/Organization login binding contract. PostgreSQL adapters remain transaction-bound so the calling owner can preserve atomic creation and naming.
- Claim is replay-safe only for the same target and login. Rename requires the observed login and uses compare-and-set; neither operation transfers a binding.
- Planned descriptors must never generate runtime navigation. Activating one requires an actual owner capability and route evidence; a descriptor does not create a business resource.
- Path construction only checks segment shape and serializes owner-validated locators. It does not normalize names, allocate numbers, query a Subject, or authorize access.
- Keep route templates in one executable source. Tests verify active templates against actual route files and root reservation; documentation links to the contract instead of maintaining another route registry.
- Locator resolution/reservation never grants identity, qualification, or authorization.
- Owner-local naming stays with its owner; Enterprise, Team, Repository and other scoped locators do not enter the global Account Namespace.
- Preserve stable Subject ≠ mutable Locator, scoped uniqueness, and no double-claim in shared namespaces.
