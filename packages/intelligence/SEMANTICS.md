# Intelligence 基本術語

- `ProcessingRun`：一次指定來源與處理器的解析執行。
- 文件 intake 將候選結果送交注入的 target，不代表正式確認。
- Intake 的逐請求階段通知見 [公開契約](./src/contracts/output/document-intake.ts)；通知不攜帶來源或候選內容，也不代表交易已提交。
- 同一 intake request 的重試先查 target 回執；已有 attempt 且無回執時回報未知結果，不重新呼叫模型。行為與呼叫次數由 [intake tests](./test/intake-document.test.ts) 驗證。
- 新商務 intake 經 [商務解析用例](./src/application/use-cases/commercial-intake.ts) 先保存技術 observations/hints，再呼叫注入的草稿 target。單一 dispatch fence、原命令狀態與 result 恢復見 [契約](./src/contracts/output/commercial-intake.ts)；不把 business candidate 另存 Intelligence，也不以自己的旗標宣告 Contract 已保存。
- 正式輸入 token counter 與生成共用請求內容；超過64k或無法計數時不 dispatch。READY 的保存恢復與狀態查詢不重跑 counter／模型。
- 實際行為見 [processing](./src/application/use-cases/processing.ts) 與 [intake](./src/application/use-cases/intake-document.ts)。

公開能力以 [manifest](./package.json) 的 exports 為準；資料定義與行為以 source／tests 為準。
