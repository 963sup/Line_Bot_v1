# Functions

Vercel server runtime 的產品程式仍在 [apps/web](../../../../apps/web/AGENTS.md)，本目錄不建立另一個 `api/` 或示範 handler。入口責任見 [Runtime entrypoints](../../../../docs/rules/runtime-entrypoints.md)。

- Route Handler／Server Action 只作 transport adapter，呼叫對應 Owner public capability。
- Node.js／Edge 選擇依實際 dependency 與 provider 支援決定，不因可部署就搬移既有 Node.js persistence。
- 執行時間、記憶體、region、body size、併發與 Fluid Compute 設定依目標方案及 runtime 讀回；不在 README 固定為永久免費配額。
- Long-running work 需要 durable intent、worker／retry 與 recovery；request 結束不代表外部任務完成，instance 記憶體與本機檔案不作持久權威。

後續驗收：授權、輸入上限、timeout、unknown outcome、重播與資料庫連線壓力。平台契約：[Vercel](../../../../docs/reference/platform/README.md#vercel)。
