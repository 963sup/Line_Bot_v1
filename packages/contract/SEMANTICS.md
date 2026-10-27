# Contract 基本術語

- `ContractDocument`：採購單候選資料、來源與確認版本。
- Engineering Contract：工程合約及其承諾資料。
- 兩者目前各有 [文件用例](./src/application/use-cases/documents.ts) 與 [工程合約用例](./src/application/use-cases/contracts.ts)。

公開能力以 [manifest](./package.json) 的 exports 為準；資料定義與行為以 source／tests 為準。
