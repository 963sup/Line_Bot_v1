# Intelligence 基本術語

- `ProcessingRun`：一次指定來源與處理器的解析執行。
- 文件 intake 將候選結果送交注入的 target，不代表正式確認。
- 實際行為見 [processing](./src/application/use-cases/processing.ts) 與 [intake](./src/application/use-cases/intake-document.ts)。

公開能力以 [manifest](./package.json) 的 exports 為準；資料定義與行為以 source／tests 為準。
