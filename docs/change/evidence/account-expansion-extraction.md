# Account expansion extraction — 2026-09-13

Source 基準為 `30f241afaae425ecdc68f73d2296651adb557dd2`，提取來源為 `62c717a18196e0255ebfc22103bb8d3d21e5f6e2`。本 evidence 對應當時 working tree 與 retired Supabase environment，不代表 current remote target 或 deployment。

## Retained result

- Stable text Account root 與既有 human identity continuity 保留；沒有 rekey 既有 ID。
- Registration/import writer 在同一 transaction 建立 root/facet，沒有新增第二個正式 writer。
- Wallet/Ledger holder 與 actor/scope 保持分離；Coin 沒有因 Account kinds 擴張而自動開放。
- 歷史 event/runtime mutation 權限收斂，沒有為 migration 保留 permanent dual-write/compatibility authority。
- Repository 的完整 validation 在修正一個 PGlite test typing 問題後通過。
- Preserve-data remote cutover 在 transaction 內比較既有資料、catalog 與 clean declarative target，失敗 precondition 先 rollback，再修正比較方式後重跑；沒有略過 drift guard。
- 當時的 restricted runtime readback、rollback negative cases 與雙連線 identity 競爭驗證均未留下 synthetic data。

## Boundary

這只證明當時 Account/User expansion 的 data-preserving transition。它不證明目前 Supabase parity、Vercel deployment、LINE device、Enterprise/Organization/Workforce/Payroll acceptance。

Current Account contract 回 [Account owner](../../010-domain-owners/010-account.md)；current schema 回 `supabase/schemas/`；current remote target 只由 operations/release configuration 與 live readback決定。

原始 catalog counts、provider identifiers、row snapshots、DDL hash 與一次性操作細節已從 current tree 蒸餾；需要稽核時由 Git history 取得。
