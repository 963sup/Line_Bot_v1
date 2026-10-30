# Notifications package constraints

Local constraints for `@line_bot_v1/notifications`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Notifications stores delivery references only; it does not acquire source truth of the triggering event.
- Delivered messages reference stable source entity locators.
- Issue/Discussion/Repository-WBS Notification creation and Inbox read/mark-read recheck current Repository visibility/access. Project-WBS sources instead require active User plus current Project READ, bind the exact Baseline/Revision, and use explicit recipients without Watch.
- Dispatch state mutation must be idempotent and replay-safe.
