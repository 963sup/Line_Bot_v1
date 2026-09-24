# Web 模組約束

責任與允許依賴見 [Module ownership](../../../../docs/020-architecture/030-module-boundaries.md) 與 [Dependency rules](../../../../docs/020-architecture/040-dependency-rules.md)。

- module 擁有專用畫面、互動、文案與 HTTP 投影；用例／查詢協調放 application，規則放 domain。
- 不 import app 或其他 module 私有實作；跨功能具體依賴由 app/api/_composition 注入。
- request path 先以第一性原理確認真正 use case 與 owner，再追 dependency 根因；根因確認後用奧卡姆剃刀移除只轉傳參數或結果、沒有 policy / translation / transaction / recovery 責任的 service、manager、repository wrapper。
- client 不得直接、間接或 type-only 引用 server；server 接線用 .server.ts，連線／設定延遲取得，import 不產生外部副作用。
- 前端只投影資格；私有狀態在身分失效或切換時清除，遲到回應不得覆蓋新狀態，失敗不當空資料。
- 檔案預設平放；不建立四層模板、雜項 services／utils、轉傳 wrapper 或第二套型別。