# App 路由約束

路由、分區及相容入口依 [Web runtime](../../../../docs/020-architecture/050-runtime-architecture.md) 與 [Route contract](../../../../docs/020-architecture/050-runtime-architecture.md)；程式責任依 [Monorepo](../../../../docs/020-architecture/010-repository-architecture.md)。

- app 只做框架入口、HTTP delivery 與畫面／依賴組裝，不複製用例或執行 DDL。
- 根層遵守架構檢查白名單；每個 URL 一個 owner，不 import 其他 page／layout 當元件。
- layout／slot 不授權；註冊、恢復、Webhook 與一般會員操作依各自資格契約。
- callback 按所屬流程核驗；憑證不複製到產品 URL。
- layout 只載入所有子頁都需要的外框。slot／攔截路由須有實際需求，驗證直接開啟、軟導覽、返回及退出，不預建空 slot。