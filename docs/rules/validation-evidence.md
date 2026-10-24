# Validation and evidence

Choose evidence by responsibility; smaller evidence never proves a larger claim.

| Evidence | Proves | Does not prove |
| --- | --- | --- |
| `pnpm docs:check` | Markdown structure/links + convergence manifest integrity | code/runtime/deployment |
| `pnpm schema:check` | local declarative schema contract | remote Supabase state |
| `pnpm check` | repository gate for the affected change and transitive consumers | unrelated Owner verification, deployment/provider/device |
| `pnpm validate` | explicit full static/test/build gate | deployment/provider/device |
| Provider/API readback | specific remote state | unrelated business flow |
| Device/browser acceptance | observed user flow/environment | unrelated source/schema correctness |

一般修改、PR 與 main release 都依同一 changed-owner selection contract 執行；需要稽核性全庫重跑時才明確使用 `pnpm validate`。External mutation/probe 不是一般 offline validation。

本機與 CI 的 typecheck/test stage 最多同時執行兩個 Turbo tasks，避免多個 Owner 的 PGlite 初始化互相爭用資源。Owner 內部測試併發、測試內容、逾時與成功條件維持原有契約。

Failure 先讀實際 log，沿 consumer/contract/owner 找根因；不得為變綠放寬 authorization、architecture guard、schema invariant 或 test expectation。

## Output evidence budget

驗證必須完整執行，但完整 stdout/stderr 不是更強的 evidence。成功以 command、revision、exit status、stage summary 與耗時回報；原始 log 留在 ignored artifact，不載入 Agent context。失敗先回傳固定上限的 tail、第一個可行動錯誤與 artifact path；只有現有片段不足以定位下一個查詢時，才針對單一 stage／owner 局部讀取。截斷 context 不得截斷實際 command、縮小 gate 或丟失原始 evidence。
