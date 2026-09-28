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

- Business meaning / owner / relationship 以 `architecture/semantic-model.json` 為 structured authority。
- 現有 module path、module kind 與 workspace dependency allowlist 以 `architecture/implementation-topology.json` 為 machine authority。
- 新 responsibility 只有在現有 owner 無法正確承接，而且具有真實 language / lifecycle / invariant / consumer 時，才考慮新的 owner 或 package。
- Application host（如 `apps/web`）只能依賴 `architecture/implementation-topology.json` 開放的 Workspace packages；底層一致性邊界（如 `ledger`）由 Aggregate Root（如 `wallet`、`daily-check-in`）封裝，禁止直接向 Web 暴露。
- 預留或基礎模組（如 `payroll`、`workforce`）在有真實可執行 Consumer 與測試契約前保持 inactive，不得提早開放 Web 依賴。
- Owner-specific adapter 留在 owner；LINE / Google 等 provider protocol 留在 integration owner；只有無 business authority 的中立 runtime mechanism 才進 `platform`。
- Consumer 不得直接讀另一 owner 的 private schema / table 來繞過 public contract。

## Mandatory classification

每個 production source 必須有且只有一個主要 architecture role。若無法唯一回答「這個檔案屬於哪一層、負責什麼」，先解 architecture ambiguity，再新增功能。

Canonical roles：

```text
packages/<owner>/
│
├─ Domain
│  ├─ Entity
│  ├─ Value Object
│  ├─ Aggregate / Aggregate Root
│  ├─ Domain Service
│  ├─ Domain Event
│  ├─ Domain Policy / Specification
│  └─ Business Invariant / Transition
│
├─ Contracts / Ports
│  ├─ Inbound Port
│  ├─ Outbound Port
│  ├─ Published DTO
│  └─ Stable cross-package Contract
│
├─ Application
│  ├─ Use Case
│  ├─ Command / Query
│  ├─ Application Service
│  └─ Orchestration
│
├─ Adapters
│  ├─ Inbound Adapter
│  └─ Outbound Adapter
│
├─ Composition / Public Entry
│  └─ dependency wiring / named public capability
│
└─ Test / Evidence
   ├─ Domain behavior
   ├─ Application use case
   ├─ Contract
   └─ Adapter integration
```

這是 responsibility taxonomy，不是空資料夾模板。沒有真實 responsibility 的 layer 不得為了對稱建立空 folder、interface、wrapper、service 或 facade；但已存在的 source 不得因為「檔案少」而省略分層判定或混合責任。

常見實體 placement 可使用：

- `src/domain.ts` 或 `src/domain/`
- `src/contracts.ts` 或 `src/contracts/`
- `src/application.ts` 或 `src/application/`
- `src/adapters/`
- named composition / public entry，例如 `src/postgres.ts`、`src/gemini.ts`
- `src/testing/` 與 `test/`

Folder name 不是 authority；source responsibility 與 dependency direction 才是。

## Hexagonal dependency direction

Inner layers 不知道 concrete infrastructure。依賴方向只能朝內：

```text
Inbound Adapter
      │
      ▼
Inbound Port / Application Use Case
      │
      ▼
    Domain
      ▲
      │
Outbound Port
      ▲
      │
Outbound Adapter
```

以 source dependency 表示：

```text
Composition
   ├─> Inbound Adapter ─> Application ─> Contracts / Domain
   └─> Outbound Adapter ───────────────> Contracts / Domain

Domain       ─X─> Contracts / Application / Adapters
Contracts    ─X─> Application / Adapters
Application  ─X─> concrete Adapters
```

### Domain

Domain 是 business truth、invariant、state transition 與 domain language。

允許：

- Entity、Value Object、Aggregate、Domain Service、Domain Event、Policy / Specification。
- 純 business rule 與 deterministic transition。

禁止：

- Supabase / PostgreSQL / SQL / SDK / HTTP / LINE / Google / Next.js。
- environment variable、runtime framework、migration、database client。
- import Application、Adapter、testing-only implementation。
- 用 persistence shape 或 provider DTO 取代 Domain model。

### Contracts / Ports

Port 表達 consumer / Application 真正需要的 capability；Contract 表達穩定交換語意。

Inbound Port 定義外部如何啟動 use case；Outbound Port 定義 Application 完成 use case 所需要、但不應知道其 concrete technology 的 capability。

允許：

- Port interface / callable contract。
- Published DTO、跨 package stable contract。
- 依賴 Domain types，前提是沒有暴露 private implementation。

禁止：

- concrete SQL / SDK / provider implementation。
- Application orchestration。
- 為包裝 private API 而存在的 pass-through interface。
- 建立第二份 Domain truth。

只有存在真實 consumer、variation、external technology boundary、policy boundary、transaction / recovery responsibility 或 isolation requirement，才新增 Port / abstraction。

### Application

Application 負責 use-case orchestration，不擁有新的 business truth。

允許：

- Command / Query / Use Case。
- transaction / workflow orchestration。
- 呼叫 Domain behavior。
- 透過 Port 取得外部 capability。

禁止：

- 直接依賴自己的 concrete Adapter。
- 直接依賴其他 package 的 private Application / Adapter source。
- 把 SQL、SDK、provider protocol 寫進 use case。
- 複製 Domain invariant 到 orchestration。

### Adapters

Adapter 把外部世界轉換成 Port / Application 能理解的形狀。

Inbound Adapter 例：HTTP handler、runtime handler、webhook transport adapter。  
Outbound Adapter 例：PostgreSQL / Supabase repository、provider SDK、HTTP client、LINE / Google / Gemini implementation。

規則：

- Adapter 可以依賴 Application / Contracts / Domain 所需的內層 contract。
- Inner layer 不得反向依賴 Adapter。
- `src/adapters/` 是 package-private implementation；外部 package / app 不得 direct import。
- Consumer 不得藉由 Adapter 直接讀另一 owner 的 private schema / table，繞過 semantic relationship / public contract。
- Integration owner 的 provider protocol 留在該 integration owner；只有沒有 business authority 的中立 runtime mechanism 才屬於 `platform`。

### Composition / Public Entry

Composition 是 concrete dependency wiring 的責任，不是 Domain / Application responsibility。

若外部 composition root 必須取得 concrete capability，公開 surface 應使用 adapter 目錄之外的 named entry，而不是公開 `src/adapters/*`：

```ts
// src/postgres.ts
export { PostgresExampleStore } from "./adapters/postgres.js";
```

`package.json#exports` 對應 named public entry：

```json
{
  "exports": {
    "./postgres": "./dist/postgres.js"
  }
}
```

禁止：

- 外部直接 import `@line_bot_v1/<owner>/adapters/*`。
- wildcard re-export 掩蓋 public contract。
- 為相容舊 path 建 facade / alias / wrapper。
- 讓 Composition 成為第二份 business truth。

### Test / Evidence

Test / Evidence 證明各層 contract 與 invariant，不是 runtime dependency。

- Domain test 驗證 invariant / transition。
- Application test 驗證 use case / Port interaction。
- Contract test 驗證 stable exchange semantics。
- Adapter integration test 驗證 SQL / provider / runtime boundary。
- `src/testing/` 只能提供 test-only capability；production runtime 不得依賴。

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
- 語意變更先修改 canonical model，再執行 `pnpm semantic:packages`。Architecture validation 會拒絕缺失或 drift 的 package semantic projection。

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
