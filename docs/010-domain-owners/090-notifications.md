# Notifications

Notifications owns user-facing Notification facts, recipient read state, and delivery attempts. Inbox is the recipient-scoped read/navigation projection over those facts; it is not a second business owner. Notifications remains a projection/delivery owner relative to source Issue/Discussion truth.

## Owns

- Notification records addressed to a recipient.
- Read/unread state and notification version.
- Channel delivery attempts, idempotency keys, retry status, and attempt counters.

## Does not own

- Issue lifecycle or discussion content; those remain in [Repository](080-repository.md).
- Announcement publishing; a broadcast message is not silently reclassified as a notification.
- User identity, membership, or source authorization.

## Invariants

- A notification references a source fact by type, id, and source version; it does not copy source authority.
- Delivery retry is idempotent per notification, channel, and delivery key.
- Read state is recipient-scoped and cannot mutate the source issue or discussion.
- Missing or unavailable source data is not reported as an empty inbox without an explicit error boundary.

## Data and modules

Current persistence is split between [`850_notifications.sql`](../../supabase/schemas/850_notifications.sql) and [`851_notification_deliveries.sql`](../../supabase/schemas/851_notification_deliveries.sql). Runtime authority belongs under `packages/notifications`; Web presentation remains under `apps/web/src/modules/notifications`. The current authenticated destination is named Inbox in the UI while the published Web/API transport remains `/notifications` / `/api/notifications`; transport naming does not create a second owner.
