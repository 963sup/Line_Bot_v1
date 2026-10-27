# integration-vercel

- Semantic owner: vercel-integration
- Owner contract: [vercel-integration](../../docs/owners/vercel-integration.md)
- Module kind: integration-adapter
- Architecture: [registry.json#modules](../../architecture/registry.json#modules)

Vercel AI Gateway adapter for Assistant responses, receipt parsing, Intelligence observations, and Contract-schema-driven document candidates. No business confirmations or persistent data.

Public runtime entries and private provider transport:

```text
src/
├─ gateway.ts                         # public provider capability factory
├─ gateway-config.ts                  # environment-backed provider configuration
└─ adapters/outbound/ai-gateway/
   └─ document.ts                     # structured document transport
```

Vercel-native platform assets and documentation are grouped directly under `src/` by capability; there is no `src/vercel/` wrapper.
