# LINE integration package

Routing and module overview for `@line_bot_v1/line`.

- Semantic Owner: `line-integration`
- Authority document: [`docs/owners/line-integration.md`](../../docs/owners/line-integration.md)
- Machine boundaries: [`architecture/registry.json#modules`](../../architecture/registry.json#modules)
- Persistence mapping: [`architecture/registry.json#data`](../../architecture/registry.json#data)

## Public capabilities

- `./liff` — browser LIFF SDK, eager boot and session lifecycle.
- `./messaging-api` — server Messaging API, webhook verification/parsing, content retrieval and push delivery.
- `./mini-app` — public MINI App stage/permanent-link registration identity.
- `./rich-menu` — server Rich Menu API and image validation.
- `./identity` — server verification of LIFF identity proof.
- `./provider` — stable provider namespace used for Account binding.

The package is already the LINE integration adapter. Internal source is grouped by provider capability; there is no nested generic `adapters/` layer.

Provider reference routing: `docs/reference/line/` contains the detailed identity, webhook, messaging, MINI App and Rich Menu reference pages; executable provider behavior remains in this package, and product authorization remains with the consuming owner.
