# Notifications package constraints

Local constraints for `@line_bot_v1/notifications`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Notifications stores delivery references only; it does not acquire source truth of the triggering event.
- Delivered messages reference stable source entity locators.
- Issue/Discussion-backed Notification creation and Inbox read/mark-read must recheck the recipient's current Repository visibility/access. A User subscription never substitutes for source access.
- Dispatch state mutation must be idempotent and replay-safe.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
