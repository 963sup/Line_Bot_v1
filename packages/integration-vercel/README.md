# integration-vercel

- Semantic owner: vercel-integration
- Owner contract: [vercel-integration](../../docs/owners/vercel-integration.md)
- Module kind: integration-adapter
- Architecture: [implementation-topology.json](../../architecture/implementation-topology.json)

Vercel AI Gateway adapter for Assistant responses, receipt parsing, Intelligence observations, and Contract-schema-driven document candidates. No business confirmations or persistent data.

Runtime adapter layout:

```text
src/adapters/outbound/ai-gateway/
├─ gateway.ts   # public provider capability factory
├─ config.ts    # environment-backed provider configuration
└─ document.ts  # structured document extraction and processing adapter
```

The `src/vercel/` directory contains Vercel-native platform assets and documentation; it is not a second TypeScript runtime implementation.
