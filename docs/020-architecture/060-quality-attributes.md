# Quality attributes

本文件只保存會影響跨系統設計取捨的品質屬性。具體 lint、test、build 與工程檢查由 `060-engineering/` 擁有；沒有實測證據時不杜撰 latency、availability 或 capacity SLO。

## 優先順序

目前 repository 的 architecture constraints 支持下列優先順序：

1. **Business integrity + authorization / isolation**
2. **Replay safety + recoverability + traceability**
3. **Simplicity + maintainability**
4. **Availability without violating 1–3**
5. **Performance + resource efficiency**
6. **Scalability only when demand is demonstrated**

這個排序不是「所有情境永遠相同」的企業 policy；它是目前 code / contract 已反覆保護的系統基線。若未來產品要求改變，應用明確 decision 更新，而不是在局部實作偷偷反轉優先級。

## Repository design qualities

以下九項是 repository-level design contract。它們不是九套彼此獨立的規則，而是把 Ownership、Source of Truth、Boundary / Dependency、Validation 投影成可觀察的工程品質。詳細行為由各 canonical owner 維護；本節只定義跨系統判斷標準，不複製第二套 implementation rule。

| Quality | Contract | Canonical owner / enforcement |
| --- | --- | --- |
| Single Responsibility | 一個 module 只擁有一個 coherent responsibility；不同 business authority、invariant 或 change reason 不塞進同一 owner。只有真實責任不同才拆 module，不為目錄對稱建立空 layer。 | [Module boundaries](030-module-boundaries.md)、[Repository architecture](010-repository-architecture.md)、`architecture/semantic-model.json` + `architecture/implementation-topology.json` |
| Dependency through Interface | Module 間只透過明確 public surface / port / contract 溝通；consumer 不依賴 private implementation、`dist`、testing-only surface 或 database row。 | [Dependency rules](040-dependency-rules.md)、各 `package.json#exports`、architecture guards |
| Change Isolation | 變更預設只修改真正 owner；只有 contract、consumer 或 cross-cutting invariant 真正受影響時才擴張 change surface。不得以順手重構、compatibility facade 或 alias 把局部變更擴散。 | [Code quality](../060-engineering/050-code-quality.md)、[Change routing](../000-core/040-change-routing.md) |
| Single Source of Truth | 同一項 business meaning、architecture fact、schema、public surface、command 或 runtime evidence 只由一個 authoritative source 維護；其他位置 summary + link / derive / enforce。 | [Repository map](../000-core/030-repository-map.md)、`architecture/semantic-model.json`、`architecture/implementation-topology.json`、`docs/AGENTS.md`、machine owners |
| Separation of Concerns | UI / delivery、business rule、application orchestration、data access、provider/runtime mechanism 依不同責任分離；Bounded Context、Module Boundary、Data Boundary、Consistency Boundary 不互相代替。 | [Hexagonal architecture](020-hexagonal-architecture.md)、[Module boundaries](030-module-boundaries.md)、[Repository map](../000-core/030-repository-map.md) |
| Explicit Boundary | 每個 owner 對外要能說清楚 responsibility、public surface、consumer、private implementation 與 authority/failure semantics；沒有真實 consumer 不擴大 export。 | [Module boundaries](030-module-boundaries.md)、public exports、architecture guards |
| Testability | Core business rule 與 deterministic invariant 能在不依賴 framework/provider 的情況下直接驗證；需要 transaction、locking、RLS 或 provider behavior 的 claim 使用相應 integration evidence，不用 mock 冒充。 | [Testing strategy](../060-engineering/030-testing-strategy.md) |
| Reproducibility | 安裝、開發、檢查、完整驗證使用 manifest / lockfile / canonical command；本地與 CI 共用 repository command owner，不建立只在單一機器成立的隱性流程。 | [Local environment](../060-engineering/010-local-environment.md)、[Validation](../060-engineering/040-validation.md)、root `package.json#scripts` |
| Understandability | 同一 concept 維持單一名稱；path、owner、README routing、public contract 與 validation 位置可預測。陌生 developer / Agent 應能由 task 快速定位 Owner → Truth → Boundary → Change surface → Validation。 | [Change routing](../000-core/040-change-routing.md)、[Repository architecture](010-repository-architecture.md)、[Code quality](../060-engineering/050-code-quality.md) |

### Root-cause acceptance rule

任何新增 module、package、public contract、shared abstraction 或 cross-owner dependency，至少必須能回答：

1. **Owner**：它唯一負責什麼？既有 owner 為什麼不能承接？
2. **Consumer**：哪個真實 consumer 現在需要它？
3. **Contract**：consumer 真正需要的 public capability / data 是什麼？
4. **Isolation**：修改 implementation 時，哪些其他 owner 不應被迫跟著改？
5. **Truth**：哪一份 source 是 authoritative？其他文件／設定如何 reference 或 derive？
6. **Validation**：哪個 executable check / test 能證明 boundary 與 behavior 沒壞？

任一項沒有具體答案時，回到第一性原理與根因分析，不用 Delete / Merge / Simplify 來掩蓋 ambiguity；「未來可能」「比較乾淨」「看起來完整」本身不構成新增責任的證據。根因確認後，再用奧卡姆剃刀判斷哪些部分可以刪除、合併、重用或必須新增。

## Architecture decision filter

遇到兩個以上可行方案時，依序問：

1. **第一性原理**：真正結果、硬約束與不可犧牲 invariant 是什麼？
2. **高手思維**：repository 既有最佳解、外部 benchmark 與成功 pattern 怎麼處理同類責任？哪些只是表象，哪些可逆向為 principle？
3. **根因**：當前痛點是 owner、truth、boundary、dependency、data、runtime 還是 validation 錯位？哪個 source 修正後會同時消除最多 symptom？
4. **奧卡姆剃刀**：根因修正後，哪些 owner、state、network hop、storage、facade、cache、queue 或 failure mode 已沒有存在理由？
5. **Dependency / contract**：consumer 真正需要哪些 capability，authority 是否仍留在 owner？
6. **Validation / evidence**：哪個 test / guard / measurement 能證明根因已消失且 invariant 沒被削弱？

「更通用」「更 enterprise」「將來容易 scale」不構成品質提升，除非有 workload、failure、consumer 或 maintenance evidence。

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

- System boundary：[System](../000-core/010-system.md)
- Runtime：[Runtime architecture](050-runtime-architecture.md)
- Cache policy：[Cache and projections](../040-data/060-cache-and-projections.md)
- Security：[Security](../050-security/README.md)
- Engineering quality：[Code quality](../060-engineering/050-code-quality.md)
- Recovery：[Recovery](../070-operations/030-recovery.md)
