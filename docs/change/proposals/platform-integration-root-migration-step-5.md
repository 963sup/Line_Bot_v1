# Platform integration root migration — Step 5：Supabase Client 與 File Storage 邊界

Status: Supabase Storage client adapter 已由 PR #412 實施；完整 native CLI／remote read-only acceptance 仍待 Step 8。上一階段：[Step 4](./platform-integration-root-migration-step-4.md)；下一階段：[Step 6](./platform-integration-root-migration-step-6.md)。

## 當前狀態／目標
`packages/integration-supabase/src/storage-client.ts` 只負責 `@supabase/supabase-js` 伺服器端 client 與 timeout、session 設定。現有 `packages/file/src/adapters/outbound/storage/supabase.ts` 的邏輯包含 File 的 hash key、SHA-256、verified upload/read/remove、unknown-outcome readback 和 `FileError`。**後者是 File 商業／一致性 Port 實作，不因使用 Supabase 就整包移入 integration**。

## 最小實施
1. 盤點所有 `@supabase/supabase-js` 使用者：File Server/private Storage、Web browser/Auth/public publishable config、operator、可能的 Edge Functions。區分 public URL/publishable key 與 **server-only Service Role**；絕不為共用 client 把 service-role 傳入 browser。
2. 只有重複且語意相同的 Supabase SDK 初始化抽到 `integration-supabase` 公開、明確命名的最小工廠；不要在 provider package 創造 Account/Contract/Repository CRUD 或通用 SQL Repository。
3. File 維持 `FileObjectStore` / `FileObjectRemoval` Port、原始檔案資格與 digest 語意，僅 adapter 取得底層 transport；其他 PostgreSQL Owner 持續經 `@line_bot_v1/platform/postgres` 與各自 persistence public boundary，而不是改成 client-side Supabase SDK。
4. 檢查環境變數 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 與 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`、Postgres 連線用途，保持 credential 最小權限及正確 Scope。Provider errors 必須轉為原 Port 的固定錯誤，不能回傳 raw URL/token/Storage 路徑。

## 驗收反例
- 損壞或與 revision 不一致的 bytes／SHA → 無新 File head/receipt。
- Upload 逾時但實際已寫入 → exact bytes readback 不重複覆寫；無 readback → 明確 UNKNOWN/UNAVAILABLE。
- 刪除未經 provider readback 證實 → 不可宣告成功。
- 無 current Repository 權限、跨 tenant/source → 拒絕；Service Role 不成為繞過應用授權的藉口。
- `pnpm --filter @line_bot_v1/file test`、typecheck、storage fixture 維持原可觀測輸出。

不為了遷移而更改 DB tables/RLS、檔案儲存 key 或現存 object；沒有 Cloud Storage copy。
