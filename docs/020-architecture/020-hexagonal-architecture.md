# Hexagonal architecture

Context-first 的現有 package 與 owner 邊界見 [Repository structure](010-repository-architecture.md)。Strategic DDD 的完整 concept / decision path 先讀 [Strategic design](../000-core/070-strategic-design/README.md)，current semantics 再回 [Domain map](../000-core/020-domain-map.md) 與 [Repository map](../000-core/030-repository-map.md)。新行為由 owning context/integration/support package 承接，不重建 horizontal packages。

## Strategic DDD 到 Hexagonal 的投影

詳細 handoff 見 [Strategic to Hexagonal](../000-core/070-strategic-design/080-strategic-to-hexagonal.md)。Hexagonal Architecture 不決定 Bounded Context；它在 boundary 已經成立後，讓依賴方向與技術替換不污染 business truth。

~~~text
Business Reality / Problem Space
↓
Subdomain / Bounded Context
↓
Ubiquitous Language / Invariants / Ownership
↓
Context relationship + Integration Semantics
↓
Implementation Mapping
↓
Domain
↓
Application
↓
Port / Contract
↑
Adapter
~~~

Port 的 owner 由 use case / consumer need 決定：

~~~text
Port
= Application 真正需要的能力

不是
= Infrastructure / Provider API wrapper
~~~

例如 Attendance 需要 current employment qualification，優先是 QualificationPort / owner query contract，而不是把整個 Account/Workforce aggregate 或 SupabaseService 暴露進來。

## 原則

Layering 是程式責任與依賴方向，不是 Bounded Context。相同業務概念可跨 Domain / Application / Adapter 技術層實作；不得因 package 名稱把技術層誤當成新的業務 Context。

先問「這段程式做什麼決策」，再問「它放在哪一層」；不能因為目前 function 已在某 package，就把責任定義成該 layer。

## Root-cause layering

Hexagonal Architecture 的 acceptance 是 responsibility 與 dependency direction 正確，不是每個 owner 都具備完整 Domain / Application / Port / Adapter 目錄。先用第一性原理與高手思維確認 use case、owner 與既有 contract，再追到 dependency 根因；根因確認後才用奧卡姆剃刀移除沒有 policy / translation / transaction / recovery / technology-boundary 責任的 interface / service / facade。

新增 Port / interface 前至少要存在一項真實理由：consumer-specific capability boundary、external technology boundary、已存在 variation / implementation，或需要把 application 與 concrete adapter 隔離。只有單一 implementation 且沒有 boundary value 的 forwarding abstraction 是 accidental complexity，應刪除而不是補齊形式。

~~~text
Preferred:
Route / Composition → Application capability → Adapter

Avoid:
Route → Facade → Service → Manager → Wrapper → Port → Adapter
        （中間沒有 policy / translation / transaction / recovery responsibility）
~~~

## Layer decision test

| 問題 | Yes 時的預設方向 |
| --- | --- |
| 拿掉 HTTP、database、SDK 後，這條規則仍必須成立嗎？ | Domain |
| 這是在協調 use case、決定先後順序或要求外部能力嗎？ | Application |
| 這是在把 port 轉成 SQL / SDK / provider protocol 嗎？ | Adapter / Infrastructure |
| 這個型別只為跨 boundary 傳遞資料，且不能帶規則嗎？ | Contracts |
| 這是 AI extraction / draft，輸出仍需正式規則驗證嗎？ | Agents |
| 這是 URL、HTTP、layout、browser interaction 或 dependency composition 嗎？ | Web |

若同一個 function 同時回答多列，通常表示責任還沒拆清楚；不要用 utils / service / manager 之類泛稱把多層責任包在一起。

## Layers

### Domain

各 owner package 的 src/domain* 保存不依賴 I/O 的業務規則：狀態轉移、不變條件、合法操作與必要值驗證。Domain 不讀 HTTP、不呼叫 SDK、不存取 database、不處理 token；跨 Context 型別依賴必須走 owner package 的公開 surface。

Domain 可以接受由 caller 提供的可信時間、位置、identity/value evidence，但不能自己決定如何從 request、session、provider 或 database 取得它們。

### Application

各 owner package 的 src/application* 保存業務 use cases、queries、流程 orchestration 與 ports。它可以依賴同 Context Domain 與必要 Contracts；外部資料庫、平台、AI 等能力以 port 表達，不直接依賴 adapter。

Application 負責把「誰先查、哪個 Domain operation、哪些外部能力、何時 commit / follow-up」組成 use case，但不應重新實作 Domain transition 或 provider protocol。

### Adapters / Infrastructure

Owner-specific database adapter 由 packages/<owner>/src/adapters 承接，provider protocol 由對應 integration package 承接；只有沒有 business authority 的共用 mechanism 才由 packages/platform 承接。Horizontal packages/infrastructure 已移除，不再作 implementation owner。Adapter 可以引用對應 Domain / Application 公開 contracts 以履行 port，但不能把 provider-specific 行為反向變成業務規則。

Adapter 可以因資料庫／SDK 限制調整實作策略，但不能自行決定 actor 有沒有 business permission、某狀態能不能 transition，或 provider success 是否代表 business success。

### Contracts

確實需要跨邊界的 DTO / read models 由 owning package 的必要 public contract 承接；horizontal packages/contracts 已移除，不建立集中式契約 owner。Contracts 不複製 Domain 規則，也不因 Web 與 Application 內部傳遞方便就建立第二套同義型別。

若一個 shared type 需要 method、state transition 或 owner-specific validation 才能正確使用，它通常不應被降成 Contracts 的中立 DTO。

### Agents

Agent 是 owner 內的受控 AI extraction / draft 技術責任，不是獨立 Bounded Context。現有 Issue intake 由 packages/assistant/src/agents 擁有，receipt recognition 由 packages/expense/src/agents 擁有；它們可以產生結構化草稿或疑點，但不負責 authorization、不直接寫正式業務資料，也不能讓模型輸出取代 deterministic business rule。

### Web

apps/web 是 presentation、route 與 runtime composition 層。app 組裝 URL / layout / concrete dependencies；modules 擁有 feature Web interaction；shared 只提供中立機制。Web 不另建第二套 Domain/Application。

Client state 可以協助 interaction / recovery，但不能成為 identity、permission、version、receipt 或 business state authority。

## Dependency direction

概念方向：

~~~text
Web / inbound adapter
        ↓
Application ──→ Domain
        ↓
   Outbound Ports
        ↑
Adapters / Infrastructure

Contracts = 必要跨邊界資料契約
Agents = 受控 AI draft capability
~~~

呼叫方向不等於 source import 方向。Application 呼叫 port，Adapter 實作 port；最外層 composition 負責把實作注入 use case。

## Cross-context ports

跨 Context port 應保持 consumer-specific 且窄：

- Stable ID 足夠 → 不建立 service。
- Current owner decision → Query / capability port。
- Owner behavior → Command port。
- Committed fact 有 real async consumer → Event / integration contract。
- External model 會污染 local language → 在 adapter/translation boundary 使用 ACL。

不要建立 AccountService、SupabaseService、RedisService 之類巨大 provider/domain wrapper 來逃避真正 contract ownership。

## Transaction 與外部 I/O

一個業務操作的 authorization、version、replay protection 與必要資料變更不能因技術分層而拆散語意。Database transaction owner 應位於真正需要原子性的 adapter / application boundary；長時間外部 API 呼叫不得留在 database lock 內。

判斷 transaction owner 時先看 Aggregate / consistency boundary，而不是「repository method 在哪裡」。Application 可以要求一個原子 use case，Adapter 負責以資料庫能力實現；Domain 只表達必須同時成立的 business invariant。

外部 delivery 若允許 business commit 後再完成，先 commit authoritative state，再以明確 durable expectation / retry contract 接續；不要為了追求一次 function call 的表面原子性把 remote API 包進長 transaction。

## 不建立的抽象

- 不為每個 Web module 複製完整 layers。
- 不建立 global service locator 或第二個 application framework。
- 不以 wrapper / facade 掩蓋錯誤 owner 或錯誤命名。
- 不為尚未發生的 provider 替換預建 compatibility layer。
- 不把 AI agent 當 authorization 或 system-of-record layer。
- 不建立只有一個 implementation、沒有 boundary value 的 interface hierarchy 來「符合分層」。

Import 細節與禁止依賴由 [Dependency rules](040-dependency-rules.md) 擁有；可執行檢查由 [Architecture guard contract](../060-engineering/060-architecture-guards.md) 擁有。
