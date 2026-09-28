# Packages router

`packages/` 保存此 repository 的正式 Module Boundaries。每個 package 都必須以 DDD + Hexagonal Architecture 分類 source responsibility；這裡提供 routing 與 canonical package template，不維護第二份 package inventory。

## Source of Truth

| 問題 | Authority |
| --- | --- |
| Product meaning、semantic owner、relationship、capability、invariant | [Semantic model](../architecture/semantic-model.json) |
| External GitHub-like semantic evidence | [Semantic benchmark](../architecture/semantic-benchmark.json) |
| Package path、module kind、workspace dependency allowlist | [Implementation topology](../architecture/implementation-topology.json) |
| Persisted relation owner、projection / reference | [Data topology](../architecture/data-topology.json) |
| Actual SQL / constraints / RLS | [Supabase schemas](../supabase/schemas/README.md) |
| Package public surface | each `package.json#exports` |
| Dependency enforcement | [Dependency Cruiser](../.dependency-cruiser.mjs) |
| Format / lint enforcement | [Biome](../biome.json) |
| Reachability / dead-code enforcement | [Knip](../knip.jsonc) |
| Package-wide execution rules | [packages/AGENTS.md](./AGENTS.md) |

Mental model：

```text
semantic-model.json
        ↓
implementation-topology.json
        ↓
data-topology.json
        ↓
package.json#exports
        ↓
src / tests / supabase schemas
        ↓
validation evidence
```

## Package 分類與職責

這張表是開發時的 semantic reminder / routing context；權威仍是 `semantic-model.json` 與 `implementation-topology.json`。若表格與 machine-readable truth 發生差異，先查明 drift / architecture violation，不得直接忽略任一方。

| 分類 | Packages | 角色與邊界原則 |
| --- | --- | --- |
| **Application Host** | `apps/web` | 頂層 Presentation / App Router 宿主。只允許依賴開放之 Application 與 Domain packages，不直接碰觸封裝帳本或未啟用領域。 |
| **Application Module** | `@line_bot_v1/explore` | 跨領域聚合視圖（Trending / Activity / Lists）。無獨立資料權威，由 Repository 概念派生。 |
| **Identity & Access** | `@line_bot_v1/account`<br>`@line_bot_v1/namespace`<br>`@line_bot_v1/identity-access` | 全域 User / Organization Login 命名空間、身分憑證與 Enterprise / Organization / Team 角色授權。 |
| **Governance & Team** | `@line_bot_v1/enterprise`<br>`@line_bot_v1/organization`<br>`@line_bot_v1/team` | 企業治理、組織成員資格、組織團隊結構與指派。 |
| **Work & Planning** | `@line_bot_v1/repository`<br>`@line_bot_v1/project`<br>`@line_bot_v1/notifications` | Repository 容器、Issue / Discussion、ProjectV2 企劃清單與通知遞送參考。 |
| **Operations & Assets** | `@line_bot_v1/attendance`<br>`@line_bot_v1/daily-check-in`<br>`@line_bot_v1/expense`<br>`@line_bot_v1/partners`<br>`@line_bot_v1/asset`<br>`@line_bot_v1/wallet` | 打卡出勤、每日簽到、費用報銷、外部合作夥伴、資產定義與使用者錢包餘額。 |
| **Encapsulated Ledger** | `@line_bot_v1/ledger` | **內部一致性邊界**。複式記帳底層帳本，僅供 `wallet`、`attendance`、`daily-check-in` 內部依賴；**禁止 Web 直接依賴**。 |
| **Integration & Adapters** | `@line_bot_v1/assistant`<br>`@line_bot_v1/line-channel`<br>`@line_bot_v1/google-workspace`<br>`@line_bot_v1/platform` | 外部通道（LINE Channel、Google Workspace）通訊協定適配與中立平台運行機制。 |
| **Reserved / Foundation** | `@line_bot_v1/audit`<br>`@line_bot_v1/payroll`<br>`@line_bot_v1/workforce` | 架構保留模組。在真實業務契約與 Consumer 建立前維持 inactive，不提早引入 Web 耦合。 |

## 開發與修改契約

1. **依賴單向性**：跨 Package 呼叫必須列於 `architecture/implementation-topology.json#allowedWorkspaceDependencies`，並由 Dependency Cruiser 自動守門。
2. **公開介面**：跨 Package 只能使用各 Package 的 `package.json#exports`；禁止透過相對路徑穿透私有內部檔案。
3. **無第二套真理**：子目錄 `packages/<owner>/AGENTS.md` 僅能增加該 Owner 本地約束；`packages/<owner>/README.md` 僅負責該模組內部導引。
4. **驗證指令**：`pnpm boundaries`、`pnpm check`、merge / release 前 `pnpm validate`。

## Canonical DDD + Hexagonal package model

每個 production source 都必須能唯一分類到一個主要 role：

```text
packages/<owner>/
│
├─ Domain
│  ├─ Entity
│  ├─ Value Object
│  ├─ Aggregate / Aggregate Root
│  ├─ Domain Service
│  ├─ Domain Event
│  ├─ Policy / Specification
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
│  └─ concrete dependency wiring / named capability
│
└─ Test / Evidence
   ├─ Domain behavior
   ├─ Application use case
   ├─ Contract
   └─ Adapter integration
```

這是 responsibility template，不是要求每個 package 預建所有 folder。沒有責任的 layer 可以沒有實體目錄；但任何已存在 source 都不能因為沒有 folder 而失去 layer classification、dependency direction 或 boundary。

若一個檔案同時負責 business invariant、use-case orchestration、SQL / SDK 與 runtime wiring，應先拆 responsibility，而不是把它視為「小 package 所以可以不分層」。

## Dependency direction

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

Source dependency 只能朝內：

```text
Domain
  ↑
Contracts / Ports
  ↑
Application
  ↑
Adapters

Composition → Application / Ports + concrete Adapters
```

禁止反向：

- Domain → Contracts / Application / Adapters
- Contracts → Application / Adapters
- Application → concrete Adapters
- inner layers → provider SDK / SQL implementation
- package → another package private source / `dist` / testing-only surface

## Layer responsibilities

| Layer | Owns | Must not own |
| --- | --- | --- |
| Domain | business truth、Entity、Value Object、Aggregate、Invariant、Transition、Domain Event / Policy | SQL、SDK、HTTP、framework、environment、runtime wiring |
| Contracts / Ports | Inbound / Outbound Port、Published DTO、stable exchange contract | concrete implementation、orchestration、second Domain truth |
| Application | Use Case、Command / Query、workflow / transaction orchestration | concrete Adapter、provider protocol、duplicated Domain invariant |
| Inbound Adapter | HTTP / webhook / runtime transport → Inbound Port | business authority |
| Outbound Adapter | Port → PostgreSQL / Supabase / SDK / HTTP / provider | business authority |
| Composition / Public Entry | concrete dependency wiring、named public capability | Domain invariant、hidden compatibility facade |
| Test / Evidence | layer-specific behavior / integration proof | production runtime dependency |

## Ports

Port 不是「為了 DDD 看起來完整」而加的 interface。

Inbound Port 表達外部如何啟動 use case。  
Outbound Port 表達 Application 真正需要的外部 capability。

只有存在真實 consumer、第二個 implementation / variation、external technology boundary、policy boundary、transaction / recovery responsibility 或 isolation requirement時，才建立 abstraction。

## Adapter privacy and public capability

`src/adapters/` 是 package-private implementation。外部 consumer 不得直接 import Adapter path。

若 composition root 必須使用 concrete implementation，package 以 adapter 目錄之外的 named public entry 發布 capability：

```ts
// src/postgres.ts
export { PostgresExampleStore } from "./adapters/postgres.js";
```

```json
{
  "exports": {
    "./postgres": "./dist/postgres.js"
  }
}
```

這個 entry 是 package boundary，不是第二份 implementation，也不是 pass-through compatibility facade。不要使用 wildcard export、alias 或舊 path wrapper 掩蓋 ownership / boundary 問題。

## Cross-owner relationship

跨 package dependency 必須能追到 `semantic-model.json` 的 relationship / integration contract，並回答：

```text
Provider
Consumer
Meaning
Integration mode
Authority
Consistency
```

Consumer 需要某項資料或 capability，不代表 Consumer 取得 Provider 的 semantic authority。

## Data mapping

Persisted truth 必須沿：

```text
Semantic concept owner
  → Data topology relation owner
  → supabase/schemas/*.sql
  → Adapter
  → Port / Application
  → Public consumer
```

Projection / reference 可以被其他 owner 消費，但不得變成第二份 authoritative truth。

## Tool-enforced boundaries

- `.dependency-cruiser.mjs`：workspace dependency allowlist、layer direction、adapter privacy、no cross-package private imports、no cycles。
- `biome.json`：format、imports、lint correctness。
- `knip.jsonc`：entry reachability、unused / unresolved surface。
- Architecture scripts：semantic / implementation / data topology 與 public export consistency。

遇到 violation，修 source、dependency、export、placement 或真正 architecture authority；不要先改 governing config、ignore、alias 或 compatibility wrapper。

## Child package docs

`packages/<owner>/AGENTS.md`：只補 owner-local constraints。  
`packages/<owner>/README.md`：只作 owner-local routing。

兩者都不得複製 `semantic-model.json`、`implementation-topology.json`、`data-topology.json`、schema、exports 或 validation truth。

## Validation routing

| Change | Canonical validation |
| --- | --- |
| ordinary package change | `pnpm check` |
| dependency / boundary | `pnpm boundaries` + `pnpm architecture` |
| semantic / architecture | `pnpm semantic check` + `pnpm architecture` + `pnpm architecture:test` |
| docs | `pnpm docs:check` |
| schema | `pnpm schema:check` |
| merge / release | `pnpm validate` |

詳細 change rules 與 invariants 見 [packages/AGENTS.md](./AGENTS.md)。
