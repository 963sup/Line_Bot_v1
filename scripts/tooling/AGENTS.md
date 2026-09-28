# Repository tooling checks

- Offline checks validate manifests, versions, command wiring and runtime configuration. Do not load product code, credentials, env files, provider APIs or build outputs.
- Workflow guards own trigger/permission/secret/current-main boundaries and canonical command invocation. They must not require historical repair steps, duplicate publication jobs or unchanged-source remote work.
- Source classification, provider transactions and recovery belong to operation-local tests. Do not duplicate those algorithms or assert incidental implementation order here.
- Keep positive, negative and repaired fixtures for boundary rules. Reject inline YAML implementations; do not broaden ignores to pass invalid configurations.
- Errors identify the owning contract. Tooling success proves repository wiring only, not remote state, credentials, protection or device acceptance.
