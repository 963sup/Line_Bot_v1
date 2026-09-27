# Repository tooling checks

- Tooling checks own executable validation of manifests, versions, scripts, workflows and runtime configuration；AGENTS text不是 machine check 的替代品。
- `check-tooling.mjs` 是 offline metadata / boundary guard：可 parse manifests、workflow YAML、TOML與source text，但不得 load product code、`.env*`、credentials、provider API或build output。
- Tooling guard驗「邊界是否正確」與「canonical entrypoint是否被使用」；不得重新實作 owner algorithm，亦不得靠比對大量 owner內部細節形成第二套 Source of Truth。
- Behavior、routing decision、provider transaction、recovery semantics若已有 owner-local executable test，`check-tooling` 只驗它沒有被 workflow / manifest 繞過。
- Keep positive、negative、repaired cases for deterministic boundary rules；不得為通過 invalid configuration 而放寬 guard或加 broad ignore。
- Workflow、package-script、AGENTS-routing、dependency/version與runtime-config contract應回報具 owner的錯誤訊息，不用 generic parser error。
- 當 workflow從 thin adapter 漂移成 inline implementation時，guard應阻止「直接在 YAML 重寫可測試 logic」，而不是開始解析並認可那套 inline implementation。
- Tooling checks是 repository evidence only；不得宣稱 external credentials、deployment、GitHub protection、Supabase state或device/runtime evidence。
