# Dependency rules

Dependency 是 change propagation 與 understanding path。只保留必要依賴，並讓 authority、public contract 與方向可預測。

## Source direction

- `app` 可組裝 `modules` / `shared`；`modules` / `shared` 不反向依賴 app composition。
- `shared` 不引用 feature module，也不擁有 feature authorization、store 或 business branching。
- Owner package 的 Domain 不依賴 framework、HTTP、SDK、database、environment 或 adapter。
- Application 協調 owner use case；需要外部 capability 時依賴 consumer-owned port / public contract。
- Adapter 實作 port，可依必要 public type；不得取得 business lifecycle / authorization authority。
- Integration package 擁有 provider protocol/credential boundary；provider SDK type 不滲入 business Domain。
- `platform` 只擁有無 business authority 的中立 mechanism，不成為所有 adapter 的 mega barrel。
- Owner-specific Agent只做 extraction/draft/inference；正式 write 仍經 deterministic validation、authorization 與 owner use case。

Workspace dependency allowlist 唯一 machine owner 是 `architecture/implementation-topology.json`；source graph、package manifests 與 guards必須收斂到同一 topology。

## Public surface

跨 package 只能依賴 owning package 的 public exports。禁止：

- `dist/`；
- 其他 package private source path；
- internal/generated private artifact；
- runtime 對 test/testing-only export；
- 直接讀其他 owner table/private schema。

`import type` 仍是 ownership dependency；不進 runtime bundle 不代表可以越界。

若缺 public export，先確認真正 owner 與 consumer need，再決定是否需要新 contract；不要先用 alias/wrapper 暴露 private model。

## Browser / server graph

Browser-reachable graph 不得包含 secret、database adapter、Node-only runtime、server composition、owner `adapters/agents/testing` 或其他 server-only implementation，除非該 surface 明確是 browser-owned capability。

檔名與 `use client` 是表達手段；真正隔離由 module graph guard驗證。

## Cross-owner decision order

需要另一 owner 時：

1. Stable ID / primitive business fact 已足夠 → 傳該值。
2. 需要 current owner decision → public query / capability contract。
3. 需要 owner state transition → owner command / use case。
4. 多個真實 asynchronous consumer 需要 committed fact，且同步耦合不合理 → event。
5. 只為 read/navigation → projection。
6. External/upstream model 會污染 local language → adapter translation / ACL。

Event、shared DTO、facade 或 interface 不因「未來可能需要」提前建立。

## Data disclosure

跨 boundary 只傳 consumer 所需最小資訊：

- stable identity，而不是 producer Aggregate graph；
- narrow projection，而不是 database row / ORM entity；
- verified business intent，而不是 client 宣告的 actor/role；
- version/request identity只作 concurrency/replay contract，不作 permission；
- provider payload先由 integration boundary驗證／翻譯，再進 business model。

若 consumer 需要大量 producer private fields 才能成立，回頭檢查 ownership/boundary，而不是擴大 export。

## Cycles

遇到 cycle 不新增第三個 `common` package。先查：

- 哪一側才是 authority；
- 是否應由 outer application composition 或 port 反轉 dependency；
- 是否誤把不同 Context model 用 shared type 綁住；
- 是否只是 read projection 應由 composition組合；
- 是否有 responsibility 放錯 owner/layer。

只有真實中立、穩定、無 business authority 的共同 mechanism 才能進 shared/support。

## Change contract

新增、刪除或改變 workspace dependency 時，同 changeset 同步 consumer/owner `package.json`、`architecture/implementation-topology.json` 與 lockfile；不得只放寬 guard。新增依賴需能指出真實 consumer capability與方向。

Authorization、transaction、replay/version、tenant isolation、recovery 與 public wire semantics 不得因 dependency refactor 改弱。

## Validation

實際允許／拒絕矩陣由 architecture guards/tests維護。修改規則時同時提供合法案例與能暴露根因的違規反例；完成後走 root canonical validation。
