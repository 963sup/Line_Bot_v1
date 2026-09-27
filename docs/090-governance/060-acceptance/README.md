# Acceptance

本目錄只保留仍有 recovery、regression 或 release 判斷價值的具日期證據。它們不是 current product / architecture / remote state 的第二份 truth。

- [Acceptance evidence](010-acceptance-evidence.md)：證據使用規則與 validation 類型邊界。
- [Schema history extraction — 2026-09-13](040-schema-history-extraction.md)：為何歷史 migration SQL 可退出 current tree，以及可由哪個 Git revision 回復。
- [Account expansion extraction — 2026-09-13](050-account-expansion-extraction.md)：Account/User expansion 的來源、data-preserving cutover 與限制。
- [Four-model cutover validation — 2026-09-14](060-four-model-cutover-validation.md)：User/Organization/Enterprise/Team cutover 的主要 failure、修正與最終 repository validation。
- [Atomic declarative schema / remote convergence — 2026-09-18](080-atomic-schema-remote-convergence.md)：owner-based schema source 與 permission contract convergence 的 dated evidence；remote environment 已退役，不代表 current target。

已被後續 source、schema、acceptance 完整取代的舊 release snapshot、原始 console log、SAP prototype checklist 與 static foundation evidence 已從 working tree 移除；需要稽核時使用 Git history。
