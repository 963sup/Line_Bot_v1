# File scope

繼承 [packages 約束](../AGENTS.md)。

變更來源讀取或資格檢查時，一併核對 `src/contracts/output/references.ts` 的 consumer；原始檔識別與解析結果分開處理。

實際公開入口以 [package.json](./package.json) 為準，行為以 [source](./src/) 與 [tests](./test/) 確認。
