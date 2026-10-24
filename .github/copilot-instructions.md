# Repository coding instructions

Follow the root [AGENTS.md](../AGENTS.md), nearest relevant `AGENTS.md`, and current code / manifests / schema / tests. These are authoritative; this file is only a Copilot entrypoint, not a second architecture policy.

- Establish the business outcome and current evidence before changing code. Trace Symptom → Consumer → Contract → Dependency → Owner → Source of Truth → Original Trigger. Mark unproven hypotheses as unknown.
- Preserve **high cohesion**: one primary responsibility and authoritative owner per business concept/source. Maintain **low coupling**: consumers use only necessary public exports and correctly directed dependencies.
- Maintain the repository's **DDD + Hexagonal Architecture**: Domain owns business transitions/invariants; Application orchestrates use cases; Ports express real consumer capabilities; Adapters implement SQL/SDK/HTTP/runtime. Do not manufacture folders, interfaces or layers to imitate a template.
- After root cause, ownership, truth and boundaries are established, choose the **minimum sufficient implementation**. Reuse existing proven capabilities, remove unnecessary duplication, dead code and pass-through abstractions. Fewest lines/files is not the objective; preserve essential complexity.
- Prefer current repository-validated patterns and version-compatible official platform contracts when assessing **modern approaches**. Do not add frameworks, caches, queues, facades or future-proofing without actual consumer/variation/technology/policy/transaction/recovery/isolation evidence.
- Preserve authorization, tenant isolation, version/replay, transactional atomicity, recovery, privacy and audit. Never weaken a guard merely to pass CI.
- Verify actual behavior and the original failure mode with repository canonical commands; distinguish unit, native database, CI, provider, deployment and device evidence. Explain the root cause and why added complexity is necessary in the PR template.

If these instructions conflict with root or scoped governing contracts, follow the governing contracts.
