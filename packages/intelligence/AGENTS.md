# Intelligence constraints

Inherits [packages](../AGENTS.md). [Intelligence owner](../../docs/owners/intelligence.md) is a provider-specific integration owner and integration adapter, not a business Bounded Context or persistence authority.

- Implement only File's public `FileProcessor` contract. File retains source authorization/readback, processor selection, output validation, ProcessingRun lifecycle, persistence, replay and recovery.
- Provider output is untrusted candidate evidence. Intelligence cannot authorize Save, import facts or mutate downstream Domains.
- Preserve processor ID, `observations-v1:<model>` version identity, supported media mapping, bounded operation deadline and fail-closed behavior. No implicit retry, fallback or background work.
- Provider credentials remain server-only. Never log credentials, original bytes, provider output or unnecessary personal data.
- Do not add persistence, a generic AI router, schema registry, compatibility wrapper, Domain layer or placeholder Application layer without a real consumer and explicit authority.
- Cross-package imports use public exports only. File never depends on this package; application hosts compose and inject Intelligence processors.

Validation must distinguish source/protocol tests from live provider accuracy, provider acceptance, deployment configuration and LINE-device evidence.
