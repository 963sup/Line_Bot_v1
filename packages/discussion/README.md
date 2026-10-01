# Discussion package

Routing and module overview for `@line_bot_v1/discussion`.

- Semantic Owner: `discussion`
- Authority document: [`docs/owners/discussion.md`](../../docs/owners/discussion.md)
- Machine boundaries: [`architecture/implementation-topology.json`](../../architecture/implementation-topology.json)
- Persistence mapping: [`architecture/data-topology.json`](../../architecture/data-topology.json)

## Scope

Discussion and DiscussionComment identity/read lifecycle. Every Discussion remains Repository-scoped and consumes current Repository access without acquiring Repository authority. The current opaque Discussion ID is implementation evidence only; GitHub FPT `Discussion.number` remains the canonical target locator semantics and is not implemented by this ownership promotion.
