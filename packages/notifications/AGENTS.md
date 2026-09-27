# @line_bot_v1/notifications
Owner: Notification facts, recipient read state, and delivery attempts. Semantics: [Notifications](../../docs/owners/notifications.md).

- Inbox is a derived recipient projection, not a second owner.
- Notifications reference source facts but never own source lifecycle/content.
- Preserve recipient authorization, source identity/version, delivery idempotency, retry status, and distinct unavailable/missing-source failures.
- Read state is recipient-scoped and must not mutate source facts, delivery receipts, or another recipient.
