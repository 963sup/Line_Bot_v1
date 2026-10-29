# Notifications

Notifications owns user-facing Notification facts, recipient read state, and delivery attempts. Inbox is the recipient-scoped read/navigation projection over those facts; it is not a second business owner. Notifications remains a projection/delivery owner relative to source Issue/Discussion truth.

## Owns

- Notification records addressed to a recipient.
- Read/unread state and notification version.
- Channel delivery attempts, idempotency keys, retry status, and attempt counters.

## Does not own

- Issue lifecycle remains in [Issue](issue.md); discussion content remains in [Repository](../reference/domains/repository.md).
- Announcement publishing; a broadcast message is not silently reclassified as a notification.
- User identity, membership, source authorization, or User→Repository Watch subscription；Repository owns Watch state.
- Team-level `TeamNotificationSetting`; Team owns whether a Team @mention exposes an effective-member recipient population. Notifications owns recipient facts only after a source event/recipient set is provided.

## Invariants

- A notification references a source fact by type, id, and source version; it does not copy source authority.
- For `issue` / `discussion` / Repository `wbs-baseline` sources, insert must prove the recipient can currently read the source Repository；Inbox read and mark-read recheck the same current access. During R1 this Repository source remains available only for verified transfer of existing durable state.
- For `project-wbs-baseline`, creation and every Inbox read/mark-read recheck an active User plus current Project `READ`, bind the exact Project-scoped Baseline and Revision, and use explicit recipients only. Project Watch does not exist and Repository Watch is irrelevant to this source. Revoked Project access or deletion hides the old Notification rather than treating historical receipt as authority; a closed Project remains readable to an authorized recipient.
- Repository Watch subscription never grants source access. `SUBSCRIBED / UNSUBSCRIBED / IGNORED` is Repository-owned intent；Repository conversation fan-out is not enabled until a producer can apply subscription policy and current source access together.
- Delivery retry is idempotent per notification, channel, and delivery key.
- Explicit Repository WBS recipients may be UNSUBSCRIBED; IGNORED excludes them during the R1 transfer path. Project WBS recipients are explicit and do not consult Watch. Creation atomically stores Inbox, LINE intent and exact-replay receipt. Account supplies the current active LINE binding; Notifications persists target/payload/retry key before first attempt and refuses changed bindings. Timeout/crash stays unknown until an exact retry is accepted or the 23-hour window ends. Cancellation suppresses pending effects and preserves uncertainty for in-flight requests. LINE acceptance is provider evidence, not device delivery.
- Read state is recipient-scoped and cannot mutate the source issue or discussion.
- Missing or unavailable source data is not reported as an empty inbox without an explicit error boundary.
- Team `NOTIFICATIONS_ENABLED` is neither a User subscription nor a delivery receipt. A Team @mention producer must re-resolve current effective Team membership before creating recipient Notifications; `NOTIFICATIONS_DISABLED` yields no Team-wide recipients.

## Data and modules

Current persistence is split between [`850_notifications.sql`](../../packages/integration-supabase/src/schemas/850_notifications.sql) and [`851_notification_deliveries.sql`](../../packages/integration-supabase/src/schemas/851_notification_deliveries.sql). Runtime authority belongs under `packages/notifications`; Web presentation remains under `apps/web/src/modules/notifications`. The current authenticated destination is named Inbox in the UI while the published Web/API transport remains `/notifications` / `/api/notifications`; transport naming does not create a second owner.

`notification_project_source_access` is a non-authoritative cross-owner projection over WBS, Project, Account, Organization, Team and Notifications facts. It exists to enforce current source access; it never becomes Project/WBS/Notification truth.
