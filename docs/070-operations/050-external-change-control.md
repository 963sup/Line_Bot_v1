# External change control

## Principle

LINE、Supabase、Google、Redis、Vercel 等外部平台的實際狀態不由 repository config 自動推定。任何遠端寫入都先確認精確 target、operator、已有授權、可回讀結果與 recovery path。

## Separate changes

以下都視為獨立外部變更：

- LINE webhook / endpoint
- LINE Rich Menu / alias / default / user binding
- Supabase migration / database role / provider settings
- Vercel deployment / environment configuration
- Google OAuth / Workspace resource configuration
- Redis database / namespace / connection settings
- scheduler / worker activation

其中一項成功不能代表其他項已完成。

## Before write

外部寫入前確認：

1. target project / channel / service / environment。
2. expected current state 與預期變更。
3. credential / role 只具必要權限。
4. readback 或 reconciliation 方法。
5. failure / unknown result 時不盲目重送的策略。
6. rollback 或 forward-repair 條件。

## Unknown result

Timeout、connection failure 或 client crash 可能發生在 provider 已接受操作之後。遇到 unknown result 先 readback / reconcile；無法安全核對時人工處理，不用新 operation 猜測重送。

## Repository boundary

Adapter、script、menu definition 或 migration 只描述預期操作，不證明遠端已執行。External operation script 即使名稱含 `check` 也可能建立測試 key、改 webhook 或發布資源；是否唯讀以實際行為判斷。

平台專屬契約由 `030-platform/` 擁有；發布順序由 `../020-release/010-release-process.md` 擁有；具日期結果放 `090-governance/060-acceptance/`。
