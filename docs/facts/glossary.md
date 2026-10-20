# Cross-context glossary

收錄跨 owner 容易造成錯誤決策的產品詞彙與 DDD 建模詞彙。Owner-local vocabulary 留在 owner contract / reference。此處解釋詞義；具體 owner、模型與邊界仍以 architecture governing inputs 和實作證據為準。

## DDD 策略建模

| 概念 | 英文 | 作用 |
| --- | --- | --- |
| 領域 | Domain | 系統所處的整個業務問題範圍；不同於程式碼的 Domain layer。 |
| 子域 | Subdomain | 將業務問題拆成具有明確目的的部分。 |
| 核心子域 | Core Subdomain | 形成企業主要競爭優勢、值得優先投入的業務能力。 |
| 支援子域 | Supporting Subdomain | 支援核心業務，具有業務特有需求，但本身不是主要競爭優勢。 |
| 通用子域 | Generic Subdomain | 普遍存在、通常可採用成熟方案的通用業務能力。 |
| 限界上下文 | Bounded Context | 一套模型與通用語言適用的明確邊界。 |
| 通用語言 | Ubiquitous Language | 業務與開發在同一限界上下文內共同使用、反映於模型與程式碼的語言。 |
| 上下文映射 | Context Mapping | 描述不同限界上下文之間的關係、模型交換方式與合作責任。 |

Subdomain 劃分業務問題；Bounded Context 劃分模型適用範圍，兩者不必一對一。Core / Supporting / Generic 是相對於企業策略的分類，不從 package 名稱、程式碼量或技術重要性推定。

## DDD 戰術建模

| 概念 | 英文 | 作用 |
| --- | --- | --- |
| 實體 | Entity | 具有持續識別的業務物件；屬性改變後仍可是同一實體。 |
| 值物件 | Value Object | 以屬性值與值相等定義的業務物件，不依靠獨立識別；建立時維持自身不變條件。 |
| 聚合 | Aggregate | 由聚合根保護不變條件的一組實體與值物件，形成一致性與交易邊界。 |
| 聚合根 | Aggregate Root | 聚合對外的識別與操作入口，負責維持聚合內的不變條件。 |
| 領域服務 | Domain Service | 無法自然歸屬單一實體、值物件或聚合的領域邏輯；不承擔應用流程協調。 |
| 領域事件 | Domain Event | 表示已發生的業務事實；發布與傳遞機制不改變該事實的 owner。 |
| 儲存庫模式 | Repository | 抽象化聚合的持久化存取，以領域識別與模型表達載入／儲存契約。 |
| 工廠 | Factory | 封裝複雜的領域物件建立流程，使建立結果符合不變條件；簡單建立不必另加工廠。 |

DDD Repository 是持久化存取模式；下方產品詞彙中的 Repository 是業務工作容器，兩者不可混用。Aggregate、Bounded Context、package、資料表與資料庫交易不是可互換的名詞；實際邊界須由業務不變條件與依賴契約證明。程式碼責任與 placement 規則見 [packages contract](../../packages/AGENTS.md)。

## 建模與架構導讀

以最少必要複雜度為原則，先理解業務，再依實際責任選擇模型與實作方式。以下是可反覆調整的思考路徑，不是必須建立所有元件的清單。

| 階段 | 思考路徑 | 要回答的問題 |
| --- | --- | --- |
| 業務邊界 | Domain → Subdomain → Bounded Context → Context Mapping | 業務問題是什麼？模型在哪裡適用？誰負責？上下文如何合作？ |
| 領域建模 | Entity → Value Object → Aggregate → Domain Event → Repository | 哪些物件需要識別？哪些以值表達？哪些不變條件必須一起成立？是否需要事件或聚合持久化契約？ |
| 程式架構 | Application → Use Case → Port → Adapter → Infrastructure | 如何協調業務意圖？需要哪些外部能力契約？由誰實作與組裝？ |
| 需要時選用 | CQRS、Outbox、Saga、Event Sourcing、Microservices | 現有方式無法滿足哪個已證實的查詢、一致性、復原或部署需求？ |

第二階段依業務不變條件反覆調整 Entity、Value Object 與 Aggregate；Domain Event、Repository 都只在有相應責任時建立。第三階段的箭頭表示思考順序，不是 source dependency direction：Application 消費 Port，Adapter 實作 Port，Composition 負責組裝；核心模型不依賴 Infrastructure。

| 程式架構概念 | 作用 |
| --- | --- |
| Application | 協調用例執行，不取得 Domain 的業務規則所有權。 |
| Use Case | 完成一個明確業務意圖的應用流程。 |
| Port | 核心對外提供或需要的能力契約；有真實邊界或變化需求才抽出。 |
| Adapter | 將外部輸入轉成核心契約，或實作核心需要的外部能力。 |
| Infrastructure | 資料庫、網路、SDK 等技術實作與執行機制，不擁有業務語意。 |

| 選用模式 | 適用需求與邊界 |
| --- | --- |
| CQRS | 讀寫模型或存取需求明顯不同時分離責任；不必使用不同資料庫，也不要求 Event Sourcing。 |
| Outbox | 業務狀態提交後必須可靠發布事件或外部工作時，將狀態與發布意圖同交易保存，再重試傳遞；consumer 仍須處理重複。 |
| Saga | 真實跨聚合／上下文的長流程需要協調步驟、重試與補償時使用；不提供單一 ACID 交易的隔離保證。 |
| Event Sourcing | 有明確需求以事件序列作為狀態真相並重建模型時使用；一般歷史紀錄、audit log 或 Domain Event 不等於 Event Sourcing。 |
| Microservices | 有可證明的獨立部署、擴縮或故障隔離需求時拆分執行單位，並承擔分散式通訊與營運成本；不因存在 Bounded Context 就必須拆服務。 |

第四階段沒有固定演進順序，也不是每個系統都需要。各模式可獨立選用；「需要時引入」不得用來省略既有契約要求的原子性、可靠傳遞、冪等或復原保證。

## 跨上下文產品詞彙

| Term | Meaning | Not the same as |
| --- | --- | --- |
| User | provider-independent human product identity / lifecycle | Employment / Membership / provider identity |
| AccountId | stable product identity reference | authentication proof / permission |
| Principal | current trusted actor context for one operation | User / provider subject |
| Qualification | owner對 current eligibility 的 decision | authentication / permission |
| Enterprise | cross-Organization governance scope | Organization / Team |
| Organization | business/data scope + participation authority | Enterprise / Team |
| Team | Organization-scoped collaboration group | EnterpriseTeam / role |
| Employment | User 與 Organization 的具期間工作關係 | Account / OrganizationMembership |
| Repository | 獨立擁有 content / permission / state / lifecycle 的工作容器 | Git repository / Project |
| Resource | Repository 內具固定版本、分類及可選工程數量的資源 | GitObject / 通用業務 Entity |
| Contract | 固定 Resource revision 數量基準的工程約定，草稿可編輯、啟用後凍結 | 通用法律合約 / Payroll |
| Execution | 固定 ACTIVE Contract line 的數量申報及內部接受／退回／作廢事實 | Issue 完成 / Actions runner / 薪資執行 |
| Project | 跨 Repository / Work reference 的 planning boundary | Repository / WBS |
| Project Item | planning reference to underlying work | copied work truth |
| WBS | Project-owned Work Breakdown Structure | Project / arbitrary folder tree |
| Permission | capability authorization semantic | membership / provider role |
| Locator | mutable resolvable key | stable identity / authorization |
| Asset | value definition / denomination | physical fixed asset |
| Wallet | holding / balance projection | authoritative writable balance |
| Ledger | append-only value facts | accounting General Ledger |
| Accounting | accounting recognition / posting / reporting | Billing / Payment / Settlement |
| Billing / Charging | fee / receivable generation | Accounting umbrella |
| Payment | value-transfer execution | Billing / accounting posting |
| Settlement | clearing / settlement between parties | Payment initiation |

一個 concept維持一個 canonical name；storage/protocol legacy literal 不因此取得 current Domain authority。
