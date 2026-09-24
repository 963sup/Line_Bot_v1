# GitHub integration scope

- `.github/` 只擁有 GitHub 平台 integration：workflow trigger、permissions、checkout/setup、GitHub evidence 與 repository collaboration metadata；不擁有產品規則或 validation 實作。
- Workflow 保持 thin adapter：優先呼叫 root `package.json` 的 canonical commands，不在 YAML 重寫 lint、architecture、test、build 或 deployment business logic。
- 權限採 least privilege；validation workflow 維持 read-only、secret-free、credential-free。自動 release mutation 只可由已合併 main 的 affected source、成功 repository validation 與必要 deployment evidence 授權；destructive mutation 另需 explicit authorization。所有 remote mutation 都必須有精確 target、precondition 與完成後 readback。
- PR fast check 與 main full validate 是不同 evidence；不得把 preview/deployment/API/provider evidence 冒充 repository validation。
- Draft PR 是 active iteration boundary：Draft synchronize 不配置 validation runner；Ready for review / Ready PR update 才代表 remote CI intent。不要用 workflow sleep/debounce 消耗 runner minutes 來模擬節流。
- GitHub-specific precondition 與 affected-source routing 留在 workflow；LINE/Supabase/Vercel 等 provider operation 由其真正 script/package owner 實作。`Release` 只編排 validated main 後的 affected external convergence，不重寫 provider semantics。
- Workflow 以獨立 trigger／permission／external-effect responsibility 為拆分單位；checkout/setup/verify 等重複步驟不足以建立 reusable workflow，只有至少兩個真實 consumer 且 input/permission contract 一致時才抽。
- 修改 workflow 後使用既有 `tooling:check` 與相關 tests；不要建立另一套平行 CI command matrix。
