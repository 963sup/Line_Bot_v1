# 瀏覽器測試約束

命令與產物見 [README](README.md)。

- 沿用現有 JavaScript／Playwright，不另建 Python 副本；同 checkout 不同時建置 .next。
- 只接受 loopback，使用合成 LINE／API／會員，阻擋其他遠端請求；不載入正式秘密或新增產品登入後門。
- 以 role／label 與可觀察結果等待，不靠固定延遲；驗證成功、拒絕、重試、返回及重播。
- 導覽檢查 document／LIFF 初始化次數；換帳號、取消、失敗後恢復與遲到回應不得洩漏或覆蓋私人狀態。
- 變更腳本後執行 `pnpm test:browser`；保存版本、工作樹、日誌、截圖及 trace，失敗回非零。
- 交付至少一張實際截圖與產物路徑；合成瀏覽器結果不代表後端持久化、遠端登入、GPS 或手機驗收。
- 工具路徑由 Desktop workspace dependencies 或現有設定取得；專案流程不寫入上游技能。
