# File 基本術語

- `FileRevision`：原始檔案某個版本的識別、媒體資訊與雜湊。
- 來源讀取與資格檢查透過 [公開來源契約](./src/contracts/output/references.ts)。
- 狀態與資料定義見 [domain](./src/domain/file.ts)。

公開能力以 [manifest](./package.json) 的 exports 為準；資料定義與行為以 source／tests 為準。
