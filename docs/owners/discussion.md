# Discussion

Read this file for Discussion ownership and invariants.

## Responsibility

Discussion owns:

- stable Discussion identity plus canonical Repository-scoped `number`;
- Discussion title/body/category relation, OPEN/CLOSED state, close reason, deletion tombstone and conversation lock;
- Repository-scoped `DiscussionCategory` definitions and the `isAnswerable` rule;
- DiscussionComment identity/body/reply relation and delete-retain lifecycle;
- chosen answer, Discussion/Comment upvotes, Discussion→Repository Label association, DiscussionPoll/Option/Vote facts;
- exact-replay commands and immutable Discussion/category event evidence.

Repository remains authoritative for Repository identity, current visibility/access, archive state and Label definitions. A Discussion is Repository-scoped, but Repository does not own Discussion lifecycle or collaboration truth.

## Invariants

- Every Discussion belongs to exactly one Repository. Canonical `number` is unique only inside that Repository; stable DiscussionId remains separate identity.
- Legacy rows may retain opaque-ID lookup and free-text category with no number/categoryId. Runtime never guesses a category mapping. `adopt-discussion` explicitly selects an existing same-Repository category and allocates any missing number.
- Protected reads and every mutation re-check current Repository access. Repository archive makes Discussion writes fail closed while preserving reads under the current Repository visibility policy.
- Create/comment/upvote/poll-vote participation requires a current explicit RepositoryPermission; visibility-only readers receive no synthetic mutation permission. Triage operations require `triage | triage_plus | write | maintain | admin`; category management and conversation lock require `write | maintain | admin`.
- Root edit/close/reopen requires the Discussion author or current triage capability. Root deletion requires the author or current manage capability. Lock, closed, answered and archived remain independent facts.
- DiscussionCategory has stable identity and Repository scope. Category slug is stable in the current adoption. A category cannot become non-answerable while a current Discussion in that category still has a chosen answer, and an in-use category cannot be deleted.
- DiscussionComment delete retains stable identity and reply structure while clearing the deleted author's body. Current adoption permits one reply layer; a reply cannot target a deleted comment or another reply.
- One Discussion has at most one current chosen answer. The answer must reference a non-deleted comment in that Discussion and is permitted only for an answerable category. Deleting the chosen comment clears the current answer relation without deleting replies.
- Discussion→Label association references same-Repository Repository-owned Label definitions. Labels, categories and chosen answers are different classification/collaboration facts.
- Upvote is User→Discussion or User→DiscussionComment truth and never grants access. Counts and viewer state derive from the upvote relation rather than Repository Star or chosen answer.
- A Discussion may own one current Poll with stable Options. Votes reference stable options. This adoption does not invent a single-choice invariant absent from the pinned FPT. Once votes exist, options cannot be replaced, preserving interpretable vote history.
- New Discussion numbers serialize inside the Repository-scoped Discussion number namespace and never reuse the Issue number allocator.
- Every mutation carries a stable request UUID. Existing-resource mutations require `expectedVersion`; exact replay returns the stored result only after current Repository access has been revalidated. One committed Discussion mutation increments the Discussion aggregate version once and appends one immutable event at that version.
- Category mutation has its own version/event stream. Event evidence is immutable history and never becomes a second writable copy of root/comment/poll content.

## Locator rollout

Canonical lookup is Repository owner/name plus Discussion `number`:

`/{owner}/{repository}/discussions/number/{discussionNumber}`

The old opaque DiscussionId route remains active only as compatibility for links created before number adoption. Neither locator grants authorization.

## Mapping

Runtime owner: `packages/discussion`. Repository scope/resource-definition provider: `packages/repository`. Web delivery remains under Repository resource routes without acquiring Discussion authority.

Persisted relation ownership is authoritative in [data topology](../../architecture/data-topology.json); executable SQL definitions remain under `supabase/schemas/`.

Adjacent owners: [Repository](repository.md) · [Issue](issue.md) · [Notifications](notifications.md)
