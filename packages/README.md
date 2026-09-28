# Packages router

`packages/` 保存 repository 的正式 Module Boundaries。每個 package 都用 DDD + Hexagonal Architecture 管理自己的 semantic responsibility，但 package 本身不自動等於 Bounded Context、Data Boundary 或 Consistency Boundary。

本頁只負責 routing 與 package template；不維護 package inventory、owner 清單、dependency 清單或 schema 清單。

## Authority routing

| 要回答的問題 | Canonical source |
| --- | --- |
| 產品概念、語言、owner、relationship、capability、invariant 是什麼？ | [semantic-model.json](../architecture/semantic-model.json) |
| GitHub-like benchmark 真正提供什麼？ | [semantic-benchmark.json](../architecture/semantic-benchmark.json) |
| 哪個 package 實作 owner？允許依賴誰？ | [implementation-topology.json](../architecture/implementation-topology.json) |
| 哪個 owner 擁有 persisted relation？ | [data-topology.json](../architecture/data-topology.json) |
| 實際 SQL / constraint / RLS？ | [supabase/schemas](../supabase/schemas/README.md) |
| Package public API？ | 各 package `package.json#exports` |
| Dependency enforcement？ | [Dependency Cruiser](../.dependency-cruiser.mjs) |
| Formatting / import organization？ | [Biome](../biome.json) |
| Reachability / dead code？ | [Knip](../knip.jsonc) |
| Package-wide Agent rules？ | [packages/AGENTS.md](AGENTS.md) |

External benchmark 只有 evidence authority；Product adoption 必須由 `semantic-model.json` explicit mapping 決定。

## Resolve one package

處理 `packages/<module>` 時，先建立這個 mental model：

```text
semantic-model
├─ semantic owner
├─ concepts / language
├─ relationships
├─ capabilities
└─ invariants
        ↓
implementation-topology
├─ module path
├─ moduleKind
└─ allowedWorkspaceDependencies
        ↓
data-topology
├─ authoritative relations
└─ projections / references
        ↓
package.json#exports
└─ exact public capabilities
        ↓
src / tests / schemas
└─ implementation + evidence
```

不要反向從現有 adapter、route 或 table 猜 owner。

## Canonical package template

```text
packages/<module>/
├─ AGENTS.md
├─ README.md
├─ package.json
├─ src/
│  ├─ domain.ts | domain/
│  ├─ contracts.ts | contracts/
│  ├─ application.ts | application/
│  │  └─ ports/
│  ├─ adapters/
│  ├─ agents/
│  ├─ testing/
│  └─ <named-public-capability>.ts
└─ test/
```

這是 responsibility template，不是空資料夾模板：只有真實責任存在才建立對應 layer。

### Dependency direction

```text
External / Runtime
        ↓
public package capability
        ↓
Adapter ─────→ Application Port
                    ↓
               Application
                    ↓
                 Domain

Contracts → Domain
```

Hard boundary：

```text
Domain
✗ Contracts
✗ Application
✗ Adapters
✗ Runtime infrastructure

Contracts
✓ Domain
✗ Application
✗ Adapters

Application
✓ own Domain / Contracts / Ports
✗ own Adapters
✗ foreign Application source

Adapters
✓ implement owner/application ports
✓ use runtime/provider mechanisms
✗ become foreign public implementation path
```

## Public adapter capability pattern

Concrete adapter implementation 保持 private：

```text
src/adapters/postgres.ts
```

若 Web 或另一合法 consumer 必須建構它，建立 owner 的 named public composition entry：

```ts
// src/postgres.ts
export { PostgresExampleStore } from "./adapters/postgres.js";
```

再由 package export 暴露：

```json
{
  "exports": {
    "./postgres": {
      "types": "./dist/postgres.d.ts",
      "default": "./dist/postgres.js"
    }
  }
}
```

Consumer：

```ts
import { PostgresExampleStore } from "@line_bot_v1/example/postgres";
```

禁止：

```ts
import { PostgresExampleStore } from "@line_bot_v1/example/adapters/postgres";
export * from "./adapters/postgres.js";
```

也禁止直接 import foreign `src/**`、`dist/**` 或 runtime `testing/**`。

## Cross-owner interaction

Cross-owner dependency 先查 `semantic-model.json#relationships`。

合法 relationship 必須能回答：

```text
Provider
Consumer
Meaning
Integration mode
Authority
Consistency
```

再由 consumer 真正需要的 capability 決定 Port / Contract；不得把 provider aggregate、private adapter 或 table 當 contract。

## Data mapping

Persisted fact 先查 `data-topology.json`：

```text
Concept authority
→ Semantic owner
→ Relation owner
→ Schema source
→ Owner adapter
→ Public capability / relationship contract
→ Consumer
```

Projection / reference 只能 derive / reference authority，不得成為第二個 business truth。

## Tool-enforced rules

三份 config 是 package implementation 的 governing constraints，不是一般 CI 修復目標：

- `.dependency-cruiser.mjs`
  - topology dependency allowlist
  - no unresolved / cycle
  - inner layer purity
  - adapter privacy
  - no cross-package relative import
  - no package → app
  - no runtime testing dependency
- `biome.json`
  - canonical formatter
  - organize imports/exports
  - selected correctness / suspicious lint rules
- `knip.jsonc`
  - package/test reachability
  - exported-surface reachability
  - unused / unresolved detection

若 source 違反規則，修 source / dependency / export / placement；不要改 config 讓違規消失。

## Package-local docs

每個 package 的文件只回答 local delta：

```text
AGENTS.md
├─ Owner-local constraints
├─ Local invariants
├─ Local boundary exceptions required by real responsibility
├─ Change rules
└─ Local validation

README.md
├─ Purpose
├─ Source navigation
├─ Public capability navigation
├─ Test navigation
└─ Links to canonical architecture/data truth
```

Child 文件不得複製 global owner inventory、topology、schema 或 export truth。

## Validation routing

| Evidence | Command |
| --- | --- |
| Biome formatting / lint | `pnpm lint` |
| Package dependency boundaries | `pnpm boundaries` |
| Architecture model + guards | `pnpm architecture` / `pnpm architecture:test` |
| Reachability | `pnpm deadcode` |
| Type correctness | `pnpm typecheck` |
| Behavior | `pnpm test` |
| Build | `pnpm build` |
| General affected validation | `pnpm check` |
| Full merge validation | `pnpm validate` |

實作前與 CI failure 後都回到同一條鏈：

```text
Owner
→ Truth
→ Boundary
→ Dependency
→ Correct change
→ Validation
→ Evidence
```
