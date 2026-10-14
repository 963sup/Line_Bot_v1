# Wiki constraints

Inherits [packages](../AGENTS.md). Authority: [Wiki owner](../../docs/owners/wiki.md).

- Page identity survives renaming; every page has its own head/version.
- Immutable revisions are content authority. Restore creates another revision.
- Current Repository access applies to all reads, including historical content.
- Editing uses exact write/maintain/admin permissions; archive blocks new writes.
- Authorization, replay, head and immutable revision persistence retain the same transaction boundary.
- Domain decides transitions; adapters own SQL, locks and mapping only.
- Wiki references never acquire WBS, Issue or Discussion authority.

- Public command parsing, edit policy and domain errors serve the authenticated CLI/Web consumers. Transport projection stays in Web; no SQL/identity/HTTP code enters Domain. The page revision remains the immutable aggregate head/content model; splitting files must follow independent responsibility, not folder symmetry.
