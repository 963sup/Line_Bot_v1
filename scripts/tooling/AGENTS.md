# Repository tooling checks

- Tooling checks own executable validation of manifests, versions, scripts, workflows and runtime configuration; AGENTS text is not a substitute for a machine check where a rule is deterministic.
- Keep positive, negative and repaired cases for semantic rules; do not weaken validation or add broad ignore patterns to accommodate an invalid configuration.
- Tooling checks are repository evidence only. They must not claim external credentials, deployment, GitHub protection, Supabase state or Desktop hot reload unless independently read back.
