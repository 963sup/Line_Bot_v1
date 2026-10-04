# LINE integration package constraints

Local constraints for `@line_bot_v1/line`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- All inbound webhook requests must verify the LINE signature before parsing.
- LINE User ID is a provider facet; must be bound to canonical Account identity.
- Webhook processing is idempotent to handle redeliveries gracefully.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
- LINE provider capability catalogs are routing only; do not materialize API categories as source folders, wrappers, or exports without a real responsibility and consumer.
- Internal Rich Menu decomposition may grow by responsibility, but it must preserve the `./rich-menu` public contract and server-only provider boundary unless an explicit contract change requires otherwise.
