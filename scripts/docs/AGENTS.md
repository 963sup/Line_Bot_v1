# Documentation governance scripts

- Own Markdown syntax/link checks and convergence machine state; never product/runtime truth.
- `check-docs.mjs`: structure/local links. `convergence.mjs`: inventory, review freshness, byte ceiling, upstream coverage, and completion via `docs/convergence-manifest.json`.
- Manifest is current state; Git owns history. Imported skill provenance stays in `skills-lock.json`.
- Never weaken owner/security/transaction/evidence contracts to pass checks.
