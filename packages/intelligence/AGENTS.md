# Intelligence constraints

Inherits [packages](../AGENTS.md). [Intelligence owner](../../docs/owners/intelligence.md) is a provider-specific integration owner and integration adapter, not a business Bounded Context or persistence authority.

- Intelligence owns document-understanding and processing lifecycle, provider protocol, immutable processing revisions, run receipts and saved extraction evidence. It reads exact authorized bytes only through File's public source reader.
- Provider output remains untrusted. Contract owns candidate validation, authorization, version/replay rules, formal data and durable receipt; Intelligence cannot access Contract persistence or write another target store.
- Processing commands use Intelligence-owned storage and a separate receipt namespace; legacy File processing history remains read-only until controlled retention cutover. New run replay never calls the provider a second time.
- Processor identity includes provider/model version; supported media mapping, bounded operation deadline and fail-closed behavior are explicit. No implicit retry, fallback or background work.
- Provider credentials remain server-only. Never log credentials, original bytes, provider output or unnecessary personal data.
- Do not add a generic AI router, schema registry, duplicate target schema, or second structured-result truth. The selected intake capability records only technical attempt recovery state, never the candidate or business facts; an unknown attempt never retries the provider automatically.
- Cross-package imports use public exports only. File never depends on this package; application hosts compose File and target public capabilities with Intelligence.

Validation must distinguish source/protocol tests from live provider accuracy, provider acceptance, deployment configuration and LINE-device evidence.
