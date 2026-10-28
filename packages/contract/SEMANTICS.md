# Contract 基本術語

- `ContractDocument`：採購單候選資料、來源與確認版本。
- Engineering Contract：工程合約及其承諾資料。
- 兩者目前各有 [文件用例](./src/application/use-cases/documents.ts) 與 [工程合約用例](./src/application/use-cases/contracts.ts)。
- 商務文件欄位可經 [唯讀評估用例](./src/application/use-cases/commercial-document-review.ts) 取得已授權來源後，執行草稿／核對驗證。成功的評估不代表已保存或成為 VERIFIED revision；來源授權 Port 見 [契約](./src/contracts/output/commercial-document-review.ts)。此入口尚未接入 Web。
- 商務草稿的 [建立用例](./src/application/use-cases/commercial-documents.ts) 與 [PostgreSQL 接線](./src/composition/bootstrap/commercial-documents.ts) 將 head、immutable revision 與 command receipt 同交易保存；資料表見 [canonical SQL](../integration-supabase/src/schemas/619_contract_documents.sql)。相同命令重送前會重驗當下授權並讀回原回執；Web composition 已接上 Intelligence immutable result reader 與 Contract 正規化；UI 只提供 DRAFT 解析／讀取／恢復，尚未提供商務編輯或 VERIFIED 提交。

公開能力以 [manifest](./package.json) 的 exports 為準；資料定義與行為以 source／tests 為準。
