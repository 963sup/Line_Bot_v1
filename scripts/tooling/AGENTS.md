# Repository tooling checks

- Tooling checks own executable validation of manifests, versions, scripts, workflows and runtime configuration; AGENTS text is not a substitute for a machine check where a rule is deterministic.
- `check-tooling.mjs` is an offline metadata guard: it may parse manifests, workflow YAML, TOML and source text, but must not load product code, `.env*`, credentials, provider APIs or build output.
- Keep positive, negative and repaired cases for semantic rules; do not weaken validation or add broad ignore patterns to accommodate an invalid configuration. If a new AGENTS rule is deterministic, prefer adding an executable check here instead of relying on prose.
- Workflow, package-script, AGENTS-routing, dependency/version and runtime-config contracts should fail with a specific owner-facing message that tells which source of truth moved, not a generic parser error.
- Tooling checks are repository evidence only. They must not claim external credentials, deployment, GitHub protection, Supabase state or Desktop hot reload unless independently read back.
