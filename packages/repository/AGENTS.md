# @line_bot_v1/repository
Owner: Repository identity/access, stars/lists, Issue, Discussion, Label, Repository Milestone, and Repository-derived discovery. Semantics: [Repository](../../docs/owners/repository.md).

- Domain internals are concept-first: `domain/<concept>/...`; within a concept, use tactical DDD folders such as `entities`, `value-objects`, `policies`, `events`, and `errors` only when that responsibility exists. Do not flatten Repository, Issue, Discussion, Milestone, or Star List into shared technical-type folders.
- Project Milestone is separate; Project may reference Repository work but never owns its lifecycle/access truth.
- Preserve current Repository access, assignment qualification, expected version, replay identity, and durable event/history semantics.
- Locators never replace stable IDs or authorization.
- Star Lists are User-owned projections over current Stars; list membership never grants Repository access.
- Discovery derives existing truth and rechecks current visibility/access; it is not a separate Explore owner.
- Runtime mutation authority follows activated capabilities, not table existence; data-only/read-only objects stay non-writable until a real command consumer exists.
