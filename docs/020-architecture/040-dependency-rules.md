# Dependency rules

Context-first 的現有 package 與允許依賴見 [Repository structure](010-repository-architecture.md)；新行為由 owning context/integration/support package 承接，不重建 horizontal packages。

## Source dependency direction

依賴規則用來保護 owner、authority 與 runtime boundary，不用來美化目錄。

- `app` 可以組裝 `modules` 與 `shared`；`modules` 不引用 `app`。
- `shared` 不反向引用 feature modules 或 app，也不得保存 feature-specific authorization、store 或 business branching。
- 一個 feature composition 不直接引用另一 feature composition。需要跨功能 concrete port 時，由 `app/api/_composition` 在最外層組裝與注入。
- Context package 內的 `domain` 不依賴 adapter、framework、HTTP、SDK、database 或 environment。
- Context package 內的 `application` 只依賴 owner domain/contracts/ports，以及經核定的其他 owner public contract；外部能力使用 ports。
- Context-specific adapter 實作 owner ports，可依必要 owner public types；adapter 不成為 business authority。
- Integration package（例如 `line-channel`、`google-workspace`）擁有 provider protocol/credential boundary，不把 provider SDK type 滲入 business domain。
- `platform` 只保存沒有 business authority 的中立 runtime/persistence mechanism；不得成為所有 business adapters 的 mega barrel。
- Workspace dependency allowlist 的 machine Source of Truth 是 `architecture/implementation-topology.json`；`.dependency-cruiser.mjs` 直接由此派生 source-edge forbidden rules，不另維護第二份 package allowlist。Manifest 與 source graph 皆必須符合同一 topology。
- Owner-specific `agents` 只做 extraction/draft/model interaction；結果仍需 deterministic validation、authorization 與 owner use case 才能形成正式 write。

Horizontal compatibility packages 已移除；後續不得以 migration re-export、wrapper、facade 或 alias 重建第二個 owner。

## Public surface

跨 package 只使用 owning package 的公開 exports。禁止直接依賴：

- `dist/`
- 其他 package 的 source implementation path
- 未公開 internal path
- product runtime 的 test / testing-only export
- 已移除或未註冊的 horizontal compatibility package

需要跨 package 的概念如果沒有 public export，先判斷 owner 是否正確；不要用 import/export alias、wrapper 或 facade 偷渡私有實作。

`import type` 仍然是 ownership dependency。型別不進 runtime bundle，不代表 consumer 可以繞過 private module / Context boundary。

## Browser / server

Browser bundle 不得可達：

- server-only composition
- secrets / environment credentials
- database adapters
- Node-only private runtime
- owner-specific `adapters` / `agents`
- test fixture / `testing`

Server-only 判斷不得依賴歷史 horizontal package 名稱。Architecture guard 以責任路徑判斷：`packages/<owner>/src/adapters`、`agents`、`testing`、`database`、`migration` 預設 server-only；只有明確 browser-owned surface（例如 LINE MINI App browser adapter）例外。

`.server.ts`、server directory、`use client` 與 explicit browser export 是表達／防護手段；真正安全由可執行 dependency guard 驗證，不能只靠檔名假設隔離成立。

## Cross-module dependencies

跨 module 依賴前先回答：

1. Consumer 真正需要的是另一 module 的 public contract，還是共用中立能力？
2. 這是 Bounded Context 互動、Code Module reuse，還是 Data Boundary？三者不得混用。
3. 依賴方向是否讓 authority 從 owner 流向 consumer，而不是 consumer 反向讀 private state？
4. 是否已有 application port / contract 可承接，不需要新增 facade？

同一概念維持單一名稱。若名稱或 owner 錯誤，修正 source，而不是在 consumer 用 alias 掩蓋。

### Cross-boundary decision order

需要別的 owner 時，先用第一性原理確認真正 consumer need，再以高手思維對照既有 contract，沿依賴追到根因；之後才用奧卡姆剃刀選擇必要 dependency：

1. **Stable ID / primitive business fact** 已足夠：只傳該值。
2. 需要 current owner decision：依賴 owner 的 public query / application contract。
3. 需要 owner 執行 state transition：呼叫 owner command/use case，不直接改它的 repository/table。
4. 多個 consumer 需要 committed fact 且同步耦合不合理：再定義 integration event。
5. 只有責任、契約、修改原因都相同的純 mechanism，才抽 shared/support。

不要反過來先建立 shared DTO / event / facade 再讓 owner 配合它。

## Data passed across boundaries

跨 boundary 的資料遵循必要揭露（least necessary disclosure），這是 security / ownership invariant，不是『最小 change』策略：

- 傳 stable identity，不傳整個 producer Aggregate graph。
- 傳 consumer 需要的 projection，不傳 database row 或 ORM entity。
- 傳已驗證 business intent，不傳 client 宣告的 actor / role 作 authority。
- 傳 version / request identity 只作 concurrency / replay contract，不把它們當 permission。
- Provider payload 先由 integration/application boundary 驗證與翻譯，再進入 Domain；不讓 SDK type 滲入核心模型。

若 consumer 需要大量 producer private fields 才能工作，先檢查 Context/module boundary 是否錯誤，而不是擴大 export。

## Implementation convergence

每次把 horizontal implementation 搬回 context 時：

1. public export path 預設保持不變；consumer 不因搬檔被迫知道 private layout。
2. 先搬 owner implementation 與 owner-specific tests，再刪 horizontal source/export/dependency。
3. adapter 搬移不等於 Data Boundary 搬移；table、schema、RLS、transaction/replay/version 不隨目錄自動改動。
4. 若移除 horizontal dependency 需要新增另一個 compatibility package，先停止並重新找 owner；不要把舊複雜度換名字。
5. 移除已不再使用的 legacy dependency，不把 transition dependency 當永久 architecture；不以全部依賴數只能下降作為新功能限制。新增真實 owner public-contract 依賴時，須說明 consumer 與方向，同步 package.json、manifest、guard 合法／違規案例；不得放寬既有安全邊界或引入 cycle。

## Cycles

遇到循環依賴時不新增第三個 `common` package 來藏 cycle。先找：

- 哪一側才是真正 authority。
- 是否應由 application orchestration / port 反轉 dependency。
- 是否把兩個其實不同的 model 用同一 shared type 綁住。
- 是否有責任放錯 layer / module。
- 是否只是 UI/read projection 應在 composition layer 組合，而不是兩個 Context 互相依賴。

只有真的存在中立、穩定、無 business authority 的共同 contract，才允許提到 contracts/support owner。

## 驗證

實際允許／拒絕矩陣由 architecture guard scripts 與測試維護。修改 guard 時必須同時有合法案例與能直接暴露根因的違規反例，不得只是放寬規則讓現況變綠。

Guard owner：[Architecture guard contract](../060-engineering/060-architecture-guards.md)。
