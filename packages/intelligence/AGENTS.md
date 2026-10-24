# Intelligence constraints

Inherits [packages](../AGENTS.md). [Intelligence owner](../../docs/owners/intelligence.md) is a provider-specific integration owner and integration adapter, not a business Bounded Context or persistence authority.

- Intelligence owns document-understanding orchestration and provider protocol. It reads exact authorized bytes only through File's public source reader, extracts against a schema injected by the target owner, and submits the untrusted candidate only through that target's public input contract.
- Provider output remains untrusted. Contract owns candidate validation, authorization, version/replay rules, formal data and durable receipt; Intelligence cannot access Contract persistence or write another target store.
- Preserve the existing File `FileProcessor` implementation and `observations-v1:<model>` identity until every existing consumer is retired. The new intake extractor has its own processor/model identity, supported media mapping, bounded operation deadline and fail-closed behavior. No implicit retry, fallback or background work.
- Provider credentials remain server-only. Never log credentials, original bytes, provider output or unnecessary personal data.
- Do not add a generic AI router, schema registry, duplicate target schema, or second structured-result truth. The selected intake capability records only technical attempt recovery state, never the candidate or business facts; an unknown attempt never retries the provider automatically.
- Cross-package imports use public exports only. File never depends on this package; application hosts compose File and target public capabilities with Intelligence.

Validation must distinguish source/protocol tests from live provider accuracy, provider acceptance, deployment configuration and LINE-device evidence.
