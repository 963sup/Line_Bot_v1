# Packages scope

`packages/<owner>` 是正式 Module Boundary。每個 package 都必須以 DDD + Hexagonal Architecture 分類責任、維持依賴方向，並能回答 Ownership、Source of Truth、Boundary / Dependency 與 Validation / Evidence。

## Authority

修改任何 package 前，必須先讀取並遵守 root `AGENTS.md#Mandatory governing set`；不得把 governing files 當成修 local violation 的 escape hatch。依序確認：

1. `architecture/README.md`：architecture truth routing、authority hierarchy 與 evidence flow。
2. `architecture/semantic-model.json`：product semantic owner、concept、relationship、capability、invariant、policy 與 integration mode。
3. `architecture/implementation-topology.json`：module path、`moduleKind`、`semanticOwner`、`allowedWorkspaceDependencies`。
4. `architecture/data-topology.json`：persisted relation owner、projection / reference 與 data boundary。
5. `package.json#exports`：package public boundary。
6. source / tests / `supabase/schemas/*.sql`：runtime behavior、database truth 與 enforcement evidence。

`architecture/semantic-benchmark.json` 只提供 external semantic evidence；沒有 `semantic-model.json` 的 explicit adoption / mapping，不得成為 product authority。

`.dependency-cruiser.mjs`、`biome.json`、`knip.jsonc` 是 governing configs。一般 feature、refactor、CI fix 不得修改它們來消除 violation；應修正 source、dependency、export、placement 或真正的 architecture truth。

Bounded Context、Module Boundary、Data Boundary、Consistency Boundary 可以對齊，但不得視為同一概念。

## Semantic / module reminders

下列規則保留作為進入 package 前的 semantic routing / boundary reminder；它們不取代上述 machine-readable authority：

- \packages\attendance = reference implementation
- packages/* = = * capability 的唯一 implementation owner
- packages/attendance = = Attendance capability 的唯一 implementation owner
- apps/web = host / delivery
- API = host / delivery
- LINE = external adapter
- Business meaning / owner / relationship 以 `architecture/semantic-model.json` 為 structured authority。
- 現有 module path、module kind 與 workspace dependency allowlist 以 `architecture/implementation-topology.json` 為 machine authority。
- 新 responsibility 只有在現有 owner 無法正確承接，而且具有真實 language / lifecycle / invariant / consumer 時，才考慮新的 owner 或 package。
- Application host（如 `apps/web`）只能依賴 `architecture/implementation-topology.json` 開放的 Workspace packages；底層一致性邊界（如 `ledger`）由 Aggregate Root（如 `wallet`、`daily-check-in`）封裝，禁止直接向 Web 暴露。
- 預留或基礎模組（如 `payroll`、`workforce`）在有真實可執行 Consumer 與測試契約前保持 inactive，不得提早開放 Web 依賴。
- Owner-specific adapter 留在 owner；LINE / Google 等 provider protocol 留在 integration owner；只有無 business authority 的中立 runtime mechanism 才進 `platform`。
- Consumer 不得直接讀另一 owner 的 private schema / table 來繞過 public contract。
- .gitkeep 做為保留結構使用 不需要刻意清除

## Canonical DDD + Hexagonal structure

每個 production source 必須有且只有一個 primary architecture role。若一個檔案無法唯一回答「誰負責、真相在哪、依賴方向是什麼」，先解 ambiguity，再新增功能。

### Stable root vocabulary

Owner package 的 `src/` 只使用這 6 個根角色：

```text
packages/<owner>/src/
├─ domain/
├─ application/
├─ contracts/
├─ adapters/
├─ composition/
└─ testing/
```

禁止新增同義根層，例如 `infrastructure/`、`infra/`、`gateways/`、`implementations/`、`repositories/`、`services/`、`shared/` 來承擔已存在角色。新的 root role 必須先證明上述 6 類無法正確承接，並同步 architecture truth 與 validation。

這是 stable vocabulary，不是空資料夾模板。沒有真實 responsibility 就不建立 folder、interface、service、wrapper、facade 或 `.gitkeep`。

### Canonical maximum shape

只有 responsibility 成長到需要分類時才展開：

```text
packages/<owner>/src/
├─ domain/
│  ├─ entities/
│  ├─ value-objects/
│  ├─ aggregates/
│  ├─ services/
│  ├─ events/
│  └─ policies/
│
├─ application/
│  ├─ use-cases/
│  ├─ commands/
│  └─ queries/
│
├─ contracts/
│  ├─ repositories/
│  ├─ input/
│  ├─ output/
│  └─ dto/
│
├─ adapters/
│  ├─ inbound/
│  │  ├─ http/
│  │  ├─ graphql/
│  │  ├─ cli/
│  │  └─ consumers/
│  └─ outbound/
│     ├─ persistence/
│     ├─ email/
│     ├─ payment/
│     ├─ cache/
│     └─ external-api/
│
├─ composition/
│  └─ bootstrap/
│
└─ testing/
```

Root role 一旦存在就使用對應 directory；不得以 `domain.ts`、`application.ts`、`contracts.ts`、root `postgres.ts` 等單檔 facade 聚合多個 responsibility。沒有真實 responsibility 則不建立該 directory。Folder 數量不是 architecture goal。

## Single-owner placement

同一 responsibility 只能存在一個 canonical location：

| Responsibility | Canonical placement | 禁止平行位置 |
| --- | --- | --- |
| Entity / Value Object / Aggregate / Domain Event / Policy | `domain/**` | Application / Contract / Adapter |
| Domain Service | `domain/services/**` | `application/services/**`、generic manager/helper |
| Use Case | `application/use-cases/**` | Adapter / Domain Service |
| Command / Query | `application/commands/**` / `application/queries/**` | DTO / Domain Entity |
| Aggregate Repository contract | `contracts/repositories/**` | `domain/repositories/**`、`application/ports/**` |
| Inbound Port | `contracts/input/**` | Application duplicate interface |
| Outbound Port | `contracts/output/**` | Domain / Adapter duplicate interface |
| Published / boundary DTO | `contracts/dto/**` | persistence row / Domain model duplicate |
| Inbound transport | `adapters/inbound/**` | Application / Composition |
| Concrete outbound implementation | `adapters/outbound/**` | Contract / Composition / Infrastructure |
| Dependency wiring | `composition/bootstrap/**` | service locator / hidden registry |
| Test-only helper | `testing/**` | production runtime |

現有 legacy path 在 package convergence 時直接搬到 canonical placement；不得使用 alias、barrel facade、compatibility wrapper 或雙路徑長期共存。

## Domain

Domain 擁有 business truth、invariant、state transition、Aggregate boundary 與 ubiquitous language。

允許：

- Entity：有 identity 與 lifecycle。
- Value Object：以 value equality 表達 business meaning，建立時即維持自身 invariant。
- Aggregate / Aggregate Root：transaction consistency boundary 與唯一 mutation entry。
- Domain Service：純 business operation，且無自然 Entity / Value Object / Aggregate owner。
- Domain Event：描述已成立的 Domain fact。
- Policy / Specification：可命名、可組合的 business decision rule。

禁止：

- SQL、Supabase、PostgreSQL、SDK、HTTP、LINE、Google、Next.js、env、framework。
- Application orchestration、retry、transport mapping。
- Repository implementation。
- 以 persistence row / provider DTO 取代 Domain model。

### Domain Service rule

整套 package structure 只有 `domain/services/**` 可以出現 Service。

Domain Service 必須同時滿足：

1. 是 business behavior。
2. 無自然 Entity / Value Object / Aggregate owner。
3. 不做 use-case orchestration。
4. 不依賴 Repository / Port / Adapter / network / environment。
5. 名稱使用 domain language，不使用 `Manager`、`Helper`、`CommonService`。

Application 不建立 `services/`。需要 orchestration → Use Case；需要 external capability → Port；需要 pure business rule → Domain。

## Contracts

`contracts/**` 是 Hexagonal Ports 與 stable exchange semantics 的唯一 owner。Contracts 可以依賴 Domain type，但不能依賴 Application 或 Adapter。

### repositories/

Repository contract 是一種 Outbound Port，但因 Aggregate persistence 語意穩定而固定放 `contracts/repositories/**`。

Repository contract 必須：

- 以 Aggregate / Domain ID / Value Object 說話。
- 表達 load / save / existence / expected-version 等 persistence capability。
- 不暴露 SQL row、Supabase type、SDK type。
- 不實作 transaction、lock、retry、mapping。

禁止在 `domain/repositories/**` 或 `application/ports/**` 再建立同義 Repository / Store。

### input/

只有需要穩定 public application capability、第二個 inbound adapter 或明確 inbound variation 時才建立 Input Port。若 Use Case 本身已是唯一入口，不建立 pass-through interface。

### output/

只描述 Application 需要、但不應知道 concrete technology 的 capability，例如：

- clock / time source。
- authorization / qualification query。
- notification / email / payment。
- object storage / cache。
- external provider API。
- durable idempotency receipt。
- cross-owner query / published capability。

若核心問題是「load/save Aggregate」，改放 `contracts/repositories/**`。

### dto/

DTO 只表達 boundary exchange semantics。不得把 persistence row、provider DTO 或 Domain Entity 原樣當 Published DTO。

## Application

Application 只負責 use-case orchestration，不建立新的 business truth。

### use-cases/

Use Case 對應一個明確 business intent，負責：

- command/query coordination。
- authorization / qualification coordination。
- 透過 Repository contract load Aggregate。
- 呼叫 Aggregate / Domain Policy。
- 呼叫必要 Port。
- transaction / result / error coordination。

Use Case 禁止：

- 複製 Aggregate invariant。
- SQL / SDK / provider protocol。
- 直接依賴 concrete Adapter。
- 以 pre-read check 作 concurrency correctness。

### commands/ 與 queries/

- Command = 有 business intent、可能改變 state 的 request model。
- Query = read intent；不得偷偷修改 authoritative state。
- Command / Query 不擁有 orchestration。

## Adapters

Adapter 只把外部世界轉成 inner contract，或把 inner contract轉成 concrete technology。

### inbound/

HTTP / GraphQL / CLI / webhook / queue consumer 負責：

- transport parsing / validation。
- authentication context extraction。
- idempotency / request identity extraction。
- transport DTO → Command / Query。
- 呼叫 Input Port / Use Case。
- Result / DomainError → transport response。

禁止 business invariant、SQL、cross-owner private-table query。

Application host 的 framework route 可以直接扮演 Inbound Adapter。若 host-local `*.server.ts` 只服務單一 route family、只做 Request/Response parsing、error mapping 或 pass-through orchestration，先把可重用的 business/input contract 收回 owner package，再由 route 直接吸收該 transport responsibility；不得為減少 route 行數保留無獨立責任的中介 server wrapper。

`Request` / `Response` / Next.js / LIFF / browser API 仍屬 host delivery，不搬進 package。只有第二個真實 transport consumer、獨立 protocol responsibility 或真實 variation 存在時，才建立 package-level `adapters/inbound/**`。

### outbound/

Outbound Adapter 實作 `contracts/repositories/**` 或 `contracts/output/**`。

- `persistence/`：PostgreSQL / Supabase Repository implementation、mapping、transaction-specific persistence。
- `email/`、`payment/`、`cache/`、`external-api/`：只有真實 provider responsibility 存在時才建立。

Adapter 可以知道 technology 與 inner contract；Domain / Contracts / Application 不得反向知道 Adapter。

## Infrastructure policy

Owner package 不建立獨立 `infrastructure/` layer。

Neutral database client、connection pool、generic transaction runner、generic runtime/config/framework mechanism 若可跨 owner 重用，由 `@line_bot_v1/platform` 擁有。

Owner-specific technology code只放 `adapters/**`。因此：

```text
知道 Attendance / Project / Repository domain
→ Adapter

不知道任何 business owner，只提供 neutral runtime mechanism
→ platform
```

這條規則用來避免 `adapters/` 與 `infrastructure/` 形成兩套 concrete implementation source of truth。

## Composition

`composition/bootstrap/**` 是唯一 concrete dependency wiring responsibility。

允許：

- 建立 concrete Adapter。
- 注入 Repository / Port。
- 建立 Use Case dependency graph。
- 啟動 worker / runtime dependency graph。

禁止：

- business invariant。
- SQL / business query。
- service locator。
- global registry。
- 第二套 Application flow。

Library package 不需要 `main.ts`。Executable runtime 若真的存在，由 application host / runtime owner 提供 entry；package public surface 仍由 `package.json#exports` 定義。

## Hexagonal dependency direction

Canonical source dependency：

```text
Inbound Adapter
      │
      ▼
Input Port / Use Case
      │
      ▼
 Application
      │
      ├──────────────► Domain
      │
      ├──────────────► Repository Contract
      └──────────────► Output Port
                          ▲
                          │
                  Outbound Adapter

Composition
  └─ wires Use Cases + Adapters

platform
  └─ neutral technical mechanism only
```

禁止反向：

- Domain → Application / Contracts / Adapters / Composition。
- Contracts → Application / Adapters / Composition。
- Application → concrete Adapter / Composition。
- Inner layers → SQL / SDK / provider implementation。
- Package → another package private source / `dist` / testing-only surface。
- Production runtime → `testing/**`。

## Correctness ownership

Concurrency、idempotency、transaction、outbox 是 Essential Complexity；每項都必須有唯一 responsibility owner。

| Concern | Owner responsibility |
| --- | --- |
| Domain | invariant、合法 transition、Aggregate consistency rule |
| Application | use-case orchestration、request identity / expected version 傳遞 |
| Repository Contract | load/save capability 與 expected-version semantics |
| Persistence Adapter | conditional update / lock / transaction / mapping / receipt / outbox persistence |
| Database / Schema | atomicity、constraint、unique key、lock / optimistic concurrency predicate |
| Inbound Adapter | 接收與驗證 idempotency/request identity；不能成為唯一 durability truth |
| Durable idempotency persistence | same identity + same fingerprint → replay；same identity + different fingerprint → conflict |
| Domain Event | 已成立的 Domain fact |
| Transactional Outbox | state + publication intent 同 transaction |
| Consumer Adapter | claim / retry / publish / downstream dedupe |
| Saga / Process Manager | 真實跨 Aggregate / Bounded Context 長流程才存在 |

Canonical mutation flow：

```text
Inbound Adapter
    │ establish request identity
    ▼
Application Use Case
    ▼
Repository.load()
    ▼
Aggregate
    │ enforce invariant
    │ produce Domain Event
    ▼
Repository.save(expectedVersion, events)
    ▼
Persistence Adapter
    │ conditional write / lock
    │ persist state
    │ persist durable receipt
    │ persist outbox
    ▼
DB transaction commit
    ▼
Consumer / Outbox Worker
    ▼
Other Bounded Contexts
```

Mandatory rules：

- 禁止用 `check → if → update` 保證 concurrency correctness。Pre-read 只能作 UX / optimization；race-sensitive invariant 最終必須由 expected version、atomic predicate、lock、constraint 或 unique key enforce。
- `save(expectedVersion)` affected rows = 0 / version mismatch → conflict；禁止 silent overwrite。
- Idempotency 必須 durable；memory / middleware-only dedupe 不是 correctness evidence。
- Aggregate state + outbox intent 必須同 transaction commit/rollback。
- External publish 在 commit 後由 worker retry；provider timeout 不回滾已成立的 Domain fact。
- Application 不複製 Domain invariant。
- Database mechanism 可以 enforce invariant，但不得取得 business semantic ownership。

## Cross-package boundary

跨 package 前先回答：

1. Consumer 真正需要什麼 capability？
2. `semantic-model.json` 中真正 semantic owner 是誰？
3. 是否存在對應 relationship / integration contract？
4. `implementation-topology.json` 是否允許 dependency direction？
5. Owner 是否已提供足夠的 `package.json#exports` public contract？
6. 是否正在依賴 private source、`dist`、testing-only surface 或另一 owner 的 private schema？

跨 package 只能使用 exact public exports。Consumer need 不會轉移 provider authority。

固定推理鏈：

```text
Business intent
  → Semantic owner
  → Relationship / Contract
  → Module owner
  → Data owner
  → Public surface
  → Adapter / Runtime implementation
  → Validation evidence
```

## Data / consistency invariants

- 每個 authoritative persisted relation 只能有一個 semantic owner。
- relation owner 必須對齊 authoritative concept owner；projection / reference 不會取得 authority。
- cross-owner mechanism 不得擁有 business truth。
- 一個 transaction / consistency boundary 只在 invariant 必須 atomic 成立時存在；不得只因 package 或 folder 相同就假設一致性邊界相同。
- authorization、tenant/data isolation、replay / idempotency、version、recovery、audit、transaction correctness 不得為了簡化 layer、CI 或 UI 而削弱。
- pure placement / naming / dependency refactor 必須保持 [Invariant kernel](../docs/rules/system-invariants.md) 的既有 semantics。
- **單一事務單一聚合**：一個資料庫事務原則上只修改一個聚合根；跨聚合協調一律透過 Domain Event 與 Transactional Outbox 達成最終一致性。
- **錯誤處理**：業務失敗返回結構化 `Result<T, DomainError>`，不拋出未受控例外。
- **冪等防重放**：寫入命令支援 Idempotency Key 或天然業務複合主鍵；事件 Consumer 強制去重。
- **讀寫分離**：探索、統計與清單等唯讀查詢直接消費 Read Projections，不載入肥大 Domain Aggregate。
- 新能力直接進真正 owner；不得用 alias、facade、compatibility package 或 pass-through service 掩蓋 responsibility 問題。
- Generated / reference data 若存在，必須能追到 canonical source；generated output、history、target design 與 current business truth 不得互相取代。

## Child package docs

每個 `packages/<owner>/` 保有 `AGENTS.md`、`README.md` 與 generated `SEMANTICS.md`：

- Child `AGENTS.md` 只增加 owner-local constraint，不複製本檔。
- Child `README.md` 只 routing，不建立第二份 owner、schema、export、capability 或 validation truth。
- Child `SEMANTICS.md` 是 `architecture/semantic-model.json` + `architecture/implementation-topology.json` 的 owner-local generated projection；不得手工作為 semantic authority。
- 語意變更先修改 canonical model，再執行 `pnpm semantic package-docs`。Architecture validation 會拒絕缺失或 drift 的 package semantic projection。

## Mandatory package resolution

修改前至少確認：

`Responsibility / Owner / Consumer / Public Contract / Dependency Direction / Data Boundary / Existing Reuse / Validation`

先追：

`Symptom → Consumer → Contract → Dependency → Owner → Source of Truth → Original Trigger`

確認 Root Cause 後，再依 responsibility 決定 Delete、Merge、Simplify、Reuse、Refactor、Move、Rename、Split 或 Add。Change size、folder count、layer count、CI 變綠速度都不是 architecture goal。

若修法需要多個 exception、alias、wrapper、ignore、fallback 才成立，重新檢查 Owner / Truth / Boundary，而不是繼續堆 compatibility surface。

- 新增、刪除或改變 workspace dependency 時，同 changeset 同步 owner `package.json`、`architecture/implementation-topology.json` 與 root `pnpm-lock.yaml`。
- 不以目錄對稱、檔案數、FPT category、GitHub Mobile surface 或「看起來像 DDD」作 package existence evidence。

## Validation

依 root canonical commands：

- `pnpm lint`
- `pnpm boundaries`
- `pnpm architecture`
- `pnpm architecture:test`
- `pnpm deadcode`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- 一般修改：`pnpm check`
- merge / release 前：`pnpm validate`

Evidence 必須精確描述實際執行內容；Lint、Typecheck、Test、Build、Architecture、Schema、Deployment、Provider Readback 與 Device Verification 不互相替代。
