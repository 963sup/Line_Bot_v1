# Discussion package constraints

Local constraints for `@line_bot_v1/discussion`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local invariants

- Every Discussion belongs to exactly one Repository; Repository identity and current access remain Repository-owned.
- Discussion and DiscussionComment state are Discussion-owned facts; Repository-scoped presentation does not transfer lifecycle authority.
- Protected reads re-check current effective Repository access through the Repository public contract.
- The current opaque Discussion ID is a local implementation locator and must not redefine GitHub FPT `Discussion.number`.
- Current runtime management includes the implemented `manage-discussions` write lifecycle; public write routes must stay aligned with current Repository access, expected-version/replay, and immutable Discussion event rules.

## Discussion writer and reader authority

- Discussion alone changes its discussions, categories, comments, answer/review status, events and receipts. Repository owns scope/access; Issue is an independent sibling Owner.
- Read access uses current Repository authorization injected into the Discussion read adapter by Host composition. Do not reintroduce a direct `repository/postgres/*` import in that reader.
- Existing write-side Repository Postgres integrations retain current locks, archive checks and replay until their transaction-safe replacement is proven. They do not grant permission to update Repository private tables.
- No Discussion command implicitly creates an Issue or changes Contract/Content/WBS; invoke those Owners' public commands for real cross-Owner actions.
