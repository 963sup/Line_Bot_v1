# LINE Channel package constraints

Local constraints for `@line_bot_v1/line-channel`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- All inbound webhook requests must verify the LINE signature before parsing.
- LINE User ID is a provider facet; must be bound to canonical Account identity.
- Webhook processing is idempotent to handle redeliveries gracefully.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
