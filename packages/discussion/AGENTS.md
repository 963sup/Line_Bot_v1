# Discussion package constraints

Local constraints for `@line_bot_v1/discussion`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local invariants

- Every Discussion belongs to exactly one Repository; Repository identity and current access remain Repository-owned.
- Discussion and DiscussionComment state are Discussion-owned facts; Repository-scoped presentation does not transfer lifecycle authority.
- Protected reads re-check current effective Repository access through the Repository public contract.
- Canonical current lookup uses the Repository-scoped `Discussion.number`; opaque Discussion ID remains compatibility-only and never grants authorization.
- `manage-discussions` is current runtime authority for root/category/comment/reply/answer/label/upvote/poll/lock mutations. Every write re-checks current Repository access, archive/lock policy, expected version where applicable, and exact replay.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/adapters/**` must not be imported outside this package.
