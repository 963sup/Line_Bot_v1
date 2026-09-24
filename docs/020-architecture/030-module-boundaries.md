# Module boundaries

Context-first 的現有 package 與 compatibility 範圍見 [Repository structure](010-repository-architecture.md)；新行為由 owning context/integration/support package 承接，不回流 horizontal packages。

Module Boundary 是程式碼責任與 public surface 邊界，不等於 Bounded Context、package/folder 或 database table。

## Module boundary 的責任契約

任何需要被其他 module 依賴的 owner，都應能回答：

1. **Responsibility**：這個 module 唯一擁有什麼程式責任。
2. **Public surface**：consumer 被允許使用哪些 export / port / DTO / entry point。
3. **Private implementation**：哪些 model、adapter、composition、helper 不構成 contract。
4. **Consumers**：哪些已存在 consumer 真的需要此 surface。
5. **Failure / authority**：consumer 可以信任什麼結果，哪些檢查仍必須由 owner 執行。

如果無法回答 consumer 與 public contract，就不要為「可能重用」先擴大 export surface。

## Web modules

`apps/web/src/modules/<business>` 擁有該功能的 Web presentation、專用互動、文案與 HTTP projection。Module 不直接引用另一 feature 的 private implementation 或 composition。

目前允許的跨 feature Web responsibility 必須是明確、窄化且可由 architecture guard 驗證的 public responsibility；需要 concrete port 的跨功能組裝由 `app/api/_composition` 在最外層完成。

Web module 可以對應某個 Bounded Context 的 presentation，也可以只是某 Context 的部分 surface；不要求 1:1。若兩個 Web surface 使用同一 owner model，不因頁面不同就複製 business logic。

## Workspace modules

正式 workspace owner 是 `packages/<context-or-integration>`。同一 package 內可以依真實需求包含 `domain / application / contracts / adapters / agents / testing` 等程式責任；layer 是技術責任，不再以 horizontal package 作永久 owner。

Owner package 內的 `src/domain*`、`src/application*` 是正式 implementation，不是 horizontal compatibility package。現存 compatibility 清單由 [Repository structure](010-repository-architecture.md) 與 manifest 維護。

Compatibility implementation 只允許被既有 context migration facade 純 re-export，不得接受新 business behavior。每搬完一個 owner，就刪除該 owner 在 horizontal package 的 source/export/test/dependency；最後一個 consumer 消失後才刪整個 package，不另造 compatibility facade。

跨 package 使用只走 owning package 的公開 exports。Consumer 若需要 private implementation，先修 owner/public contract，而不是建立 alias、wrapper 或 facade 繞過邊界。

Public export 應以 consumer 真實 need 為準，不用 wildcard export 暴露整個 source tree。只為 test / fixture / internal composition 存在的能力不得順手變成 product contract。

## Adapter ownership

Adapter 的 owner 由它替哪個 capability / integration 實作 port 決定，不由「它碰資料庫或 HTTP」決定。

- `PostgresExpenseStore` 類型的 adapter 屬 Expense owner，即使底層使用共用 PostgreSQL connection mechanism。
- LINE identity / Messaging API / MINI App protocol 屬 `line-channel` integration。
- Google provider protocol 屬 `google-workspace` integration。
- 只有 connection pool、migration runtime、Redis transport、test fixture 等沒有 business authority 的 mechanism 才適合由 `platform` 承接。

Module Boundary 與 Data Boundary 分開判斷：把 adapter 搬回 owner 不代表搬 table、改 RLS、改 transaction 或改 schema。

## Shared code

共用能力只有在責任、契約與修改原因都相同時才進 `shared` 或 support package。以下不是升格共用的充分理由：

- 多處引用
- 都是純函式
- 名稱看起來通用
- 目前程式碼相似

若兩個功能需要不同 authorization、state transition、business terminology 或 failure semantics，就仍是不同 owner。

抽 shared 前依序問：

1. 兩邊是不是其實同一 owner？若是，移到 owner 的 public surface。
2. 是不是中立 mechanism，完全不決定 feature 行為？若是，才考慮 support/shared。
3. 只是兩份程式目前長得像嗎？若是，保留重複通常比錯誤抽象更安全。

## Composition

Composition 只負責把 concrete adapters 注入 use case，不建立第二套 business layer。Feature composition 不能互相引用；跨 feature transaction 由真正擁有該 use case 的 application owner 定義，再由外層 composition 接線。

Composition 不提供 runtime service lookup 給下層自行抓 dependency；dependency 必須沿既有 constructor/function contract 明確傳入，使 owner 與 test boundary 可見。

## Boundary change rules

擴大 public surface、搬 module、合併／拆分 owner 前，先確認：

- 是否有真實 consumer 被目前 boundary 阻擋。
- consumer 需要的是資料、capability 還是 orchestration。
- 是否應以 application port / contract 解決，而不是公開 private model。
- 變更後依賴方向是否仍由 authority owner 指向 consumer。
- 舊 surface 是否可以直接移除；不保留無期限 compatibility facade。

Implementation convergence 另加以下限制：

- public import path、HTTP/LINE wire contract、error mapping、authorization、transaction、replay/version semantics 預設不變；
- 搬 source 時同步搬 owner-specific tests；
- schema/RLS/data migration 只有在該 slice 明確需要時另案處理，不與純 module ownership 搬移混在一起。

## Verification

實際可執行邊界由 [Architecture guard contract](../060-engineering/060-architecture-guards.md) 維護。修改 module boundary 時，必須同步更新合法案例與最小違規反例；不得只放寬 rule 讓現況通過。
