# Release

## Principle

Release 是把已驗證的版本與必要外部變更放行到指定環境的受控流程。`READY`、HTTP 200、migration file 存在或 Rich Menu definition 存在都不能單獨宣稱整體發布完成。

## Sequence

一般順序：

1. 確認 release candidate、target environment、operator、recovery owner 與已有外部操作授權。
2. 完成適用的 repository validation 與 deployment readiness；兩者是獨立 evidence，只有 external change 確實依賴新的 runtime contract 時才要求對應 deployment revision，不把無關變更強制綁成同一 SHA。
   - Current GitHub `Release` 只在 `main` 的 Supabase declarative schema 或 Rich Menu desired-state source 受影響時啟動。所有 mutation 先等同 SHA `Validate`；Supabase schema change 只跑一次 history-free `sync`，在同一程序內完成 plan/apply/second-diff/readback 並保存 evidence，避免重複 local rebuild。Reconciler-only 修改不啟動 remote runner。Destructive plan 留給 explicit `Supabase Replace`，先做 preserve-data `prepare`/preflight，再由人工 confirmation 授權 contract；Rich Menu publication 另等待 `mini-app-line` deployment success。
3. 必要時暫停舊 writer / 舊管理入口，取得備份與 migration 前對帳。
4. 依相依順序套用 forward migration、runtime role/config 與 Web deployment。
5. 驗證 deny path、authorized read/write、version/replay、durable readback。
6. 各自套用需要的 LINE / scheduler / external platform change，並逐項 readback。
7. 完成指定 Android / iOS 或其他必要 real-client acceptance 後才放行對應能力。

## Compatibility

Schema 與 Web 若需要協調切換，不能讓舊 Web 在已移除舊 schema contract 的資料庫上繼續服務。Migration 已套用後，若舊版本不再相容，應維持入口關閉並向前修復，不以單純程式 rollback 破壞新資料。

## Authorization changes

管理 permission、member management、partner management 等能力的 release 不得自行產生 administrator，也不從第一位註冊者、LINE ID、email 或既有 UI 可見性推定資格。授權來源與變更命令由 `050-security/030-authorization/` 擁有。

## Evidence

每個 release 必須分開記錄：

- code/build version
- schema/migration result
- runtime/deployment result
- external platform change result
- API/readback result
- real-device / acceptance evidence where required

具日期驗收證據放 `090-governance/060-acceptance/`，不累積在本文件。
