# Quality attributes

本文件只保存會影響跨系統設計取捨的品質屬性。具體 lint、test、build 與工程檢查由 [Engineering references](../engineering/) 擁有；沒有實測證據時不杜撰 latency、availability 或 capacity SLO。

## 優先順序

目前 repository 的 architecture constraints 支持下列優先順序：

1. **Business integrity + authorization / isolation**
2. **Replay safety + recoverability + traceability**
3. **Simplicity + maintainability**
4. **Availability without violating 1–3**
5. **Performance + resource efficiency**
6. **Scalability only when demand is demonstrated**

這個排序不是「所有情境永遠相同」的企業 policy；它是目前 code / contract 已反覆保護的系統基線。若未來產品要求改變，應用明確 decision 更新，而不是在局部實作偷偷反轉優先級。

## Repository design contract

Owner、Source of Truth、Boundary / Dependency 與 Validation 的 current rules 由 [repository change contract](../../../AGENTS.md)、[sources of truth](../../facts/sources-of-truth.md)、[dependency boundaries](../../rules/dependency-boundaries.md) 與 [code quality](../engineering/code-quality.md) 擁有。本文件不重述這些執行規則；只有真正改變跨系統取捨時才在此新增內容。

## Trade-offs

| 衝突 | 現行取向 | 直接結果 |
| --- | --- | --- |
| Availability vs business truth | business truth 優先 | primary business store 不可用時，不靜默切到第二個可寫來源 |
| UX convenience vs authorization | authorization 優先 | UI 已顯示、先前成功或 client role 都不能替代 server recheck |
| Fast retry vs duplicate safety | replay safety 優先 | unknown result 沿用原 request identity 查回／重試，不建立第二個 command |
| Cache speed vs freshness / isolation | freshness 與 scope 優先 | private business data 預設不以未定義 invalidation 的 cache 作 authority |
| Abstraction flexibility vs evidence | 根因與證據優先 | 先確認真實 variation / consumer；再以奧卡姆剃刀決定是否需要 compatibility layer、facade 或 event bus |
| Long transaction vs external availability | bounded transaction 優先 | DB 原子變更先 commit；長時間 LINE / Google / AI call 留在 transaction 外並明確 retry |
| Premature scale vs maintainability | maintainability 優先 | 沒有容量證據前不預切 microservices、第二 database 或 distributed workflow |

## Quality attribute meanings

### Integrity

同一 business command 需要一起成立的 authorization、version、state、ledger、event、receipt 等效果必須保持一致；不能以「服務可回 200」取代業務正確性。

### Security / isolation

缺少可信 identity、scope relationship 或 current permission 時 fail closed。Data Boundary、Bounded Context 與 Code Module 不互相替代。

### Recoverability

失敗後要能判斷 authoritative state、重新讀取或依既有 backup/recovery 恢復。Recovery 不等於建立第二套可寫 business truth。

未知結果（unknown result）本身是一種需要設計的狀態：如果無法證明 command 未發生，就不能自動建立第二個 command 來「補做」。

### Maintainability

同一概念保留單一名稱與 owner；跨 package 走 public surface；先修根因與責任錯位，再以奧卡姆剃刀移除沒有存在理由的抽象。

能以現有 owner 多一個明確 function / port 解決時，不建立新的 framework、registry、facade、base class 或 generic event layer。

### Performance

先量測真正瓶頸，再決定 cache、batch、index 或 read model。任何優化不能放寬 authorization、transaction、replay、version 或 data isolation。

性能問題先區分 CPU、I/O、database query、network、bundle、render、provider quota；不要用 cache 作所有 latency 問題的預設答案。

### Scalability

只有在已知 workload、容量或 latency evidence 顯示單體責任無法承接時才調整 boundary；部署單位與 Bounded Context 不強制 1:1。

Scale solution 必須指出目前瓶頸與量測方式。沒有 evidence 時，保持單一 owner / transaction / deployment 通常比提前 distributed 更容易維持 correctness。

## Evidence levels

架構文件的「採用」只代表 design contract；不得把下列證據混為一談：

- source / manifest / schema 靜態存在
- architecture / type / unit tests 通過
- production build 通過
- deployment 成功
- remote provider 已同步
- API / browser / LINE 真機驗證通過

需要放行或宣稱外部狀態時，轉到 Operations / Governance 的具日期 evidence；不要在 architecture 頁用現在式暗示未驗證狀態。

## 數值目標

目前 repository 沒有足夠 production evidence 定義全域 latency percentile、availability percentage、RPO/RTO 或最大使用者數。需要數值目標時，應記錄 workload、環境、量測方式、business consequence 與 owner，再由 Operations / Governance 接續驗證。

## 相鄰 owner

- System boundary：[System](../../rules/system-invariants.md)
- Runtime：[Runtime architecture](../runtime/routes.md)
- Cache policy：[Cache and projections](../data/cache.md)
- Security：[Security](../../rules/request-authorization.md)
- Engineering quality：[Code quality](../engineering/code-quality.md)
- Recovery：[Recovery](../operations/recovery.md)
