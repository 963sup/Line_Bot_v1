# GitHub integration scope

- `.github/` 只擁有 GitHub 平台 integration：workflow trigger、permissions、checkout/setup、GitHub evidence 與 repository collaboration metadata；不擁有產品規則或 validation 實作。
- Workflow 保持 thin adapter：優先呼叫 root `package.json` 的 canonical commands，不在 YAML 重寫 lint、architecture、test、build 或 deployment business logic。
- 修改現有 workflow 時保留責任分工：`validate.yml` 只做 read-only repository validation；`release.yml` 由 successful same-repository `main` `Validate` 的 `workflow_run` completion 觸發，只在 validated current `main` 後收斂 affected Supabase schema／Rich Menu desired state；`supabase-replace.yml` 是手動 destructive Supabase reconciliation。新增或拆分 workflow 前，先確認新的 trigger、permission、secret 與 external-effect boundary 真的不同。
- 權限採 least privilege；validation workflow 維持 read-only、secret-free、credential-free。自動 release mutation 只可由已合併 main 的 affected source、成功 repository validation 與必要 deployment evidence 授權；Release 的 `schema:remote sync --allow-destructive` 已獲明確授權；其他 destructive mutation 仍需 explicit authorization。所有 remote mutation 都必須有精確 target、precondition 與完成後 readback。
- PR fast check 與 main full validate 是不同 evidence；不得把 preview/deployment/API/provider evidence 冒充 repository validation。
- Draft PR 是 active iteration boundary：Draft synchronize 不配置 validation runner；Ready for review / Ready PR update 才代表 remote CI intent。不要用 workflow sleep/debounce 消耗 runner minutes 來模擬節流。
- GitHub-specific precondition 與 affected-source routing 留在 workflow；LINE/Supabase/Vercel 等 provider operation 由其真正 script/package owner 實作。`Release` 只編排 validated main 後的 affected external convergence，不重寫 provider semantics。Release affected-source baseline 只信前次 successful workflow_run Release 的 `Release <validated-sha>` run-name／display title、成功的固定 `gate` job 與 git ancestor check；沒有合格 baseline 時以 empty tree 做首次 bootstrap，保守收斂 existing desired state。
- Secrets 只放在實際需要該 secret 的最小 step 的 `env`，不放 workflow/job/global env；checkout 一律不 persist credentials。Artifact upload 保存的是該 run 的操作證據，不是 acceptance index 或長期 business truth。
- Workflow 以獨立 trigger／permission／external-effect responsibility 為拆分單位；checkout/setup/verify 等重複步驟不足以建立 reusable workflow，只有至少兩個真實 consumer 且 input/permission contract 一致時才抽。
- 修改 workflow 後跑既有 `tooling:check` 與相關 tests；若改動受 guard 保護的契約，同步 `scripts/tooling/check-tooling.mjs` 與 positive／violating／repaired cases；不要建立另一套平行 CI command matrix。
