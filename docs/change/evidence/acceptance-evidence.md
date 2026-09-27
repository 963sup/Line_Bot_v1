# Acceptance evidence

## Responsibility

本目錄保存「某個版本／環境／日期實際驗證了什麼」以及限制；不擁有產品、架構、module、integration contract 或 current remote target。

Validation 類型必須分開表述：

- static / lint / architecture guard
- typecheck
- unit / integration test
- browser test
- production build
- database reconciliation / remote API readback
- deployment
- LINE / mobile real-device acceptance
- business acceptance

一類通過不能替代另一類。

## Retained dated evidence

目前只保留仍能支援 recovery / regression / release reasoning 的四組 transition evidence：

- [Schema history extraction — 2026-09-13](040-schema-history-extraction.md)
- [Account expansion extraction — 2026-09-13](050-account-expansion-extraction.md)
- [Four-model cutover validation — 2026-09-14](060-four-model-cutover-validation.md)
- [Atomic declarative schema / remote convergence — 2026-09-18](080-atomic-schema-remote-convergence.md)

原始舊 baseline、console logs、已退役 provider identifiers 與被後續 acceptance 取代的中間 release snapshot 不保留在 current tree；Git history 已提供追溯能力。

## Current use

需要判斷現在是否可放行時：

1. 先以目前 code/schema/tests/canonical contract 判斷要求。
2. 再找與目前 revision、environment、change scope 相符的最新證據。
3. 舊 commit、retired environment、PGlite、mock、headless browser 或 local result 都必須明示限制。
4. Remote database、production deployment、LINE Console、Android/iOS、真人收件與 business sign-off 沒有當前證據時保持「未驗證」。
5. Dated evidence 若不再支援 recovery、regression 或 release decision，就蒸餾後刪除，不新增 raw-history archive。

新的 acceptance evidence 優先引用可重現 CI/artifact/provider readback；不要把長期 console output 或 current-state snapshot 堆入 docs。
