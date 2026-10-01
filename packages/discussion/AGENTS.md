# Discussion package constraints

Local constraints for `@line_bot_v1/discussion`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local invariants

- Every Discussion belongs to exactly one Repository; Repository identity and current access remain Repository-owned.
- Discussion and DiscussionComment state are Discussion-owned facts; Repository-scoped presentation does not transfer lifecycle authority.
- Protected reads re-check current effective Repository access through the Repository public contract.
- The current opaque Discussion ID is a local implementation locator and must not redefine GitHub FPT `Discussion.number`.
- Current runtime management is read-only; data-only write semantics must not be advertised as implemented behavior.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/adapters/**` must not be imported outside this package.
