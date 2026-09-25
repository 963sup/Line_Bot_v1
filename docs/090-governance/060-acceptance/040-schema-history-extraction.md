# Schema history extraction — 2026-09-13

基準 commit：`30f241afaae425ecdc68f73d2296651adb557dd2`。本次由當時的 Supabase project metadata 重新核對 environment；retired provider project／organization identifiers 已移除。本紀錄限 Account expansion 前的歷史提取階段；後續同步結果見 [Account expansion evidence](050-account-expansion-extraction.md)。

## Extraction and recovery

五份歷史 SQL 的有效最終定義已由 `supabase/schemas/` 完整承接，因此移除工作樹內的重複 SQL；沒有把一次性 backfill、已退休的 bridge 或舊 migration runner 變成 current schema。原始 SQL 保存在上述 commit，逐檔以 Git blob 原始 bytes 與移除前檔案比對 SHA256，一致。

| 原檔名 | 提取結果 | SHA256 |
| --- | --- | --- |
| `20260912023739_consolidated_baseline.sql` | 19 個歷史階段的最終 structure 分屬 foundation、membership、expense、attendance、team、announcement、task、partner、workplace、permission、SAP；已退休 table 與 transition 不重新引入 | `18a79fe60c51653b127e27ca36b70a8a6166ab559ce5a71411a82d8cde07665e` |
| `20260912035550_google_link_requests.sql` | `10_membership.sql` 保存完整 link request、唯一性、expiry、RLS 與 grants | `2f1c2d8e8b7e696a66bb331b671cced2be0e773bcc989b32405f3472842a7783` |
| `20260912165700_coin_ledger_data_boundary.sql` | 舊 Coin table 已退休；append-only 邊界由 `17_ledger.sql` 的 SELECT-only table grant 與 posting function 承接 | `ecac7b65e78c0e48de53fc92fc1cec82547f7016708c6d74c337c2e516af20b0` |
| `20260913021500_asset_ledger_expand.sql` | denomination view 在 `15_assets.sql`，final Ledger 在 `17_ledger.sql`；一次性 backfill、mirror trigger 與滾動部署鎖只留歷史 | `e3ff96a33d9e173153445bab2d77c29b5c6fb393edbfb740e300ba41fce9ff6b` |
| `20260913153000_asset_ledger_contract.sql` | final posting function／grants 在 `17_ledger.sql`；parity fence、drop bridge 與 drop legacy table 不進 clean rebuild | `cb0cea7c8eaf159b6f16b5b0e74b22691bd7fc64747563162f7eeb398568ea92` |

唯讀查閱原始 SQL：

```powershell
git show 30f241afaae425ecdc68f73d2296651adb557dd2:supabase/migrations/20260912023739_consolidated_baseline.sql
```

需要精確恢復全部原始檔案時，先輸出 archive，再解至隔離目錄並核對上表 checksum；不要對運作中的 database 重播舊 baseline：

```powershell
git archive --format=zip --output=.artifacts/historical-migrations.zip 30f241afaae425ecdc68f73d2296651adb557dd2 supabase/migrations
```

本次不改遠端 `supabase_migrations`。原部署、backfill 與 retention evidence 仍按當時語境保留於 [Asset Ledger release](030-asset-ledger-contract-release.md) 與 [歷史驗收](010-acceptance-evidence.md)。

## Local evidence

一次性隔離 PGlite 比對分別由五份歷史 SQL、十三份 current schemas 建立乾淨資料庫；這不是一般 tests 或 `schema:check` 新增的 migration 依賴。

- 324 個 columns、537 個 constraints（包含 PGlite 的 NOT NULL catalog entries）、98 個 indexes。
- 8 個 functions（完整 definition 與 ACL）、4 個非內建 triggers、49 個 policies。
- 52 個 table/view/sequence relations（含 RLS flags、ACL、view options）、1 個 view definition。
- 上述兩份 catalog 逐欄位完全一致；沒有缺失的 final DDL。
- `scripts/pnpm.ps1 schema:check` PASS：3 個 schema source tests、1 個 PGlite schema/role test。首次 sandbox 阻擋 Node child process，正常權限重跑通過，未放寬檢查。

## Remote readback

同日唯讀比對上述 project：324 個 columns、236 個非 NOT NULL constraints、98 個 indexes、49 個 policies、4 個 triggers、52 個 relations、1 個 view 均一致。PostgreSQL 17 的 NOT NULL 以 column metadata 比對，不與 PGlite 較新 catalog representation 混算。

8 個 functions 的簽章、definition、security mode、search_path 與 ACL 一致；其中 3 個 function body 只存在 CRLF/LF 差異。沒有需套用的語意 DDL，因此沒有執行無用途的 remote write。

`line_app` 為 NOLOGIN、非 superuser、非 BYPASSRLS、無 CREATEDB/CREATEROLE；`line_runtime` 保留 LOGIN 與 `line_app` membership，同樣無上述高權限。Browser roles 無 private schema USAGE，`line_app` 無 schema CREATE；application relations/functions owner 均為 postgres。Auth column SELECT 維持 users 的 id/banned_until/deleted_at/is_anonymous 與 identities 的 user_id/provider/provider_id。

檢查時有 1 位 Member、5 筆 Ledger entries、1 個 open attendance session；Team 與 TeamMembership 為 0。這些只是當次 row-count snapshot，不能作為資料可丟棄的授權。

## Limits

本紀錄只證明既有 current schema 的歷史提取與指定 catalog 比對；不是 Account/UserAccount/Enterprise/Organization/Team target implementation、資料切換、備份還原演練、Vercel deployment 或 LINE 實機驗收。Target source/runtime 與停止舊 writer 的切換順序仍依 [Account migration gates](../030-migrations/040-enterprise-organization-workforce-payroll.md)。
