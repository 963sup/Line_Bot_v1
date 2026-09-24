# Acceptance evidence

## Responsibility

本目錄保存「某個版本／環境／日期實際驗證了什麼」的證據與限制，不擁有產品、架構、module 或 integration contract。

Validation 類型必須分開表述：

- static / lint / architecture guard
- typecheck
- unit / integration test
- browser test
- production build
- database migration / remote API readback
- deployment
- LINE / mobile real-device acceptance
- business acceptance

一類通過不能替代另一類。

## Historical evidence

完整舊 `docs/testing/baseline-acceptance.md` 以原始內容保存於 `../090-history/010-baseline-acceptance.txt`。它包含 2026-09-07～2026-09-12 的多批本地／遠端驗證紀錄；其中的相對路徑與文件名稱反映當時 repository 狀態，不是目前 canonical navigation。


## Current evidence

- [Four-model cutover validation — 2026-09-14](060-four-model-cutover-validation.md)：四核心本機切換、初次 11 項 Web 失敗及根因修正；同日完整 validate 與 production build 通過，遠端切換另行驗收。
- [Schema history extraction — 2026-09-13](040-schema-history-extraction.md)：五份歷史 SQL 的最終 DDL 提取、commit/checksum 恢復入口與 current schemas／remote catalog 比對；不代表 target Account 已實作。
- [Account expansion extraction — 2026-09-13](050-account-expansion-extraction.md)：指定分支的 USER identity／holder 提取、完整 repository validation、保留資料的遠端同步與獨立 readback；完整 Enterprise／Organization／Team cutover 仍未完成。
- [Asset Ledger contract readiness — 2026-09-13](020-asset-ledger-contract-readiness.md)：contract 前的 exact `main` deployment、Supabase expand/readback、post-deploy Attendance Ledger write、Wallet projection、idempotency 與放行前限制。
- [Asset Ledger contract release — 2026-09-13](030-asset-ledger-contract-release.md)：contract migration 實際套用、migration history/catalog/data/permissions readback，以及 Vercel production health/error evidence。

## Current use

需要判斷現在是否可放行時：

1. 先以目前 code/schema/tests/canonical contract 判斷要求。
2. 再找與目前版本、環境、變更範圍相符的最新證據。
3. 若證據來自舊 commit、PGlite、mock、headless browser 或 local environment，明確保留其限制。
4. Remote migration、production deployment、LINE Console、Android/iOS、真人收件與 business sign-off 沒有對應證據時，保持「未驗證」，不能由歷史本地通過推定。

新的具日期 acceptance evidence 應使用間隔編號新增獨立文件，或使用可重現的 artifact / CI reference；不要再把所有歷史追加到單一超大 Markdown。
