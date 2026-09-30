# Packages router

`packages/` 保存此 repository 的正式 Module Boundaries。每個 package 都必須以 DDD + Hexagonal Architecture 分類 source responsibility；這裡提供 routing 與 canonical package template，不維護第二份 package inventory。

## Source of Truth

| 問題 | Authority |
| --- | --- |
| GitHub GraphQL domain semantics | [Vendored FPT JSON](../architecture/domain/fpt/) |
| Line_Bot_v1 owner、relationship、capability、invariant、implementation expectation | [Product domain overlay](../architecture/semantic-model.json) |
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
architecture/domain/fpt/*.json
        ↓ direct references
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

這張表是開發時的 routing context；GitHub-derived語意權威在 FPT，產品 ownership / invariant overlay 在 `semantic-model.json`，module truth 在 `implementation-topology.json`。若表格與 machine-readable truth 發生差異，先查明 drift / architecture violation，不得直接忽略任一方。

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
| **Audit queries** | `@line_bot_v1/audit` | 透過來源 owner 的公開授權投影查詢治理事件。 |
| **Reserved / Foundation** | `@line_bot_v1/payroll`<br>`@line_bot_v1/workforce` | 架構保留模組。在真實業務契約與 Consumer 建立前維持 inactive，不提早引入 Web 耦合。 |

## 開發與修改契約

1. **依賴單向性**：跨 Package 呼叫必須列於 `architecture/implementation-topology.json#allowedWorkspaceDependencies`，並由 Dependency Cruiser 自動守門。
2. **公開介面**：跨 Package 只能使用各 Package 的 `package.json#exports`；禁止透過相對路徑穿透私有內部檔案。
3. **無第二套真理**：子目錄 `packages/<owner>/AGENTS.md` 僅能增加該 Owner 本地約束；`packages/<owner>/README.md` 僅負責該模組內部導引。
4. **驗證指令**：`pnpm boundaries`、`pnpm check`、merge / release 前 `pnpm validate`。

## DDD + Hexagonal responsibility routing

精確 change rules 只由 [packages/AGENTS.md](./AGENTS.md) 擁有；本 README 不維護第二份 physical template。

`Domain / Application / Contracts / Adapters / Composition / Testing` 是 source responsibility vocabulary，不是所有 package 的 mandatory folders。先查 `architecture/implementation-topology.json#moduleKind`，再依真實 responsibility 決定最小充分結構：單一 responsibility 可以維持單一 source；責任成長或混合時才拆 directory。Application Module、Integration Adapter、Support Module 不為了外觀建立不存在的 Domain layer。

判斷順序固定為：`semantic owner → moduleKind → consumer / public contract → dependency direction → data / consistency boundary → physical placement`。Folder shape 是這些決策的結果，不是上游 authority。

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
`packages/<owner>/SEMANTICS.md`：generated owner-local semantic projection，讓進入 package 時直接看到 Domain、Bounded Context status、Ubiquitous Language、Capabilities 與 Context Relationships。

`SEMANTICS.md` 不建立第二份 truth；canonical authority 仍是 `architecture/semantic-model.json` 與 `architecture/implementation-topology.json`。語意修改後執行 `pnpm semantic package-docs`，`pnpm architecture` 會檢查 projection drift。

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
