# Repository package constraints

Local constraints for `@line_bot_v1/repository`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Every Issue and Discussion belongs to exactly one Repository, but their lifecycles are sibling-owned. Repository provides current scope/access; Issue additionally consumes repository-scoped number allocation.
- RepositoryId is stable across rename/visibility/archive. Current owner/name wins; old names are owner-scoped aliases followed only when requested, reserved from other Repositories, and reclaimable by the same Repository.
- PRIVATE / INTERNAL / PUBLIC are read-visibility policy, never RepositoryPermission. INTERNAL is Organization-only and derives the one current active Enterprise scope; visibility-only readers receive no collaborator roster.
- Archive preserves reads but blocks collaboration writers. Current Issue commands fail closed while archived; address remains stored but archived Repositories are excluded from new Attendance clock-in sites.
- Star/unstar is idempotent; starring never grants repository access.
- Repository Watch stores exact SUBSCRIBED / UNSUBSCRIBED / IGNORED User state, never grants access, and remains distinct from Star/Follow/Team notification setting/Notification/delivery.
- Repository Star Lists are user-owned curated collections over the user current stars and hide items/counts that fail current visibility.
- Repository has at most one nullable address value; that address is the attendance point for current effective Repository members while the Repository is not archived. Visibility, Stars and Watch never grant attendance eligibility.
- RepositoryPermission is the exact FPT six-value domain: READ / TRIAGE / TRIAGE_PLUS / WRITE / MAINTAIN / ADMIN. Grant facts preserve the exact value; effective access is a permission set, never a synthetic numeric rank.
- Permission names and product operation policy are separate. Consumers must test explicit permissions and fail closed for operations whose MAINTAIN/TRIAGE_PLUS semantics are not yet defined.
- Only a current effective Repository ADMIN can set or remove its address. Address commands preserve expected-version checks, exact replay and the shared governance/access transaction lock.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
