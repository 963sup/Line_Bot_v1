# Storage 開發規格

Bucket desired state 唯一來源是 [config.toml](../config.toml) 的 `storage.buckets.repository-files`；物件生命週期由 [File](../../docs/owners/file.md) 擁有。本目錄提供 Storage 整合與驗證設計，不存放正式檔案、credential 或第二份 bucket 設定。

## 資料與權限

private Bucket 的 object key 是儲存識別，不是存取授權。Client 必須經由 File public command/query；server-only Storage adapter 執行 I/O 前由 Owner 驗證當下 actor、Repository scope、版本及權限。實際 key、大小、格式與 checksum 規則沿用 File contract，不在此另定。

## Upload / recovery 流程

1. File transaction 建立 durable Upload Intent 與 request identity。
2. Adapter 使用 intent 對應的 immutable object key 上傳。
3. 讀回 bytes/digest，確認與 intent 一致。
4. File transaction 重驗 current permission／version，再原子 Finalize。
5. 不明上傳結果以相同 intent readback；未 Finalize 的物件交由 File 的明確 reclamation 流程處理。

Download 同樣受 File 授權，外部讀取完成後遵循 Owner 的再次授權檢查。移除物件需要獨立 operator capability 與 absence readback；不以一般 Web runtime 執行 bucket-wide sweep。

## 驗證入口

`pnpm storage:remote plan` 與 `pnpm storage:remote verify` 只讀取 Bucket 狀態。發布程序見 [File Storage publication boundary](../../docs/reference/platform/supabase.md#file-storage-publication-boundary)。

物件驗收：跨 Repository 存取拒絕、重複 upload、checksum 不符、上傳成功但 Finalize 失敗、unknown outcome、撤權、清理與 Finalize 競爭。Database backup 與 object backup 分別驗證，不能互相替代。
