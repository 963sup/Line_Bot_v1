# Repository architecture

本頁只解釋 current repository responsibility 與 placement。精確 owner、module inventory、dependency allowlist 與 Data Boundary 由 machine-readable topology 擁有，不在 Markdown 重抄。

## Authorities

| Concern | Source of Truth |
| --- | --- |
| Cross-context semantics / owner / invariant | [Semantic model](../../architecture/semantic-model.json) |
| Module path / kind / allowed workspace dependency | [Implementation topology](../../architecture/implementation-topology.json) |
| Persisted relation owner / schema-file mapping | [Data topology](../../architecture/data-topology.json) |
| Public package surface | each `package.json#exports` |
| Actual PostgreSQL definition | `supabase/schemas/` |
| Runtime behavior | source + tests |
| Human change routing | [Task router](../README.md) |

`pnpm architecture` / `pnpm boundaries` 驗證這些 mapping；Markdown 只說明 why / routing。

## Repository responsibility map

```text
apps/
→ application hosts / delivery / composition

packages/
→ business, integration, policy and support module owners

architecture/
→ machine-readable semantic / module / data / benchmark topology

supabase/
→ declarative PostgreSQL current structure + provider-local config

scripts/
→ repeatable repository / provider operation orchestration

assets/
→ repository-owned non-code assets

docs/
→ human-readable canonical knowledge

.github/
→ GitHub platform integration

.agents/
→ reusable agent capabilities

.codex/
→ Codex runtime configuration / execution policy

AGENTS.md
→ scoped change constraints
```

Directory existence 不自動建立新的 Domain、runtime 或 authority。

## Workspace

pnpm workspace 的 runtime/source workspace root 是 `apps/*` 與 `packages/*`。精確清單由 workspace manifest 與 [Implementation topology](../../architecture/implementation-topology.json) 驗證；本頁不保存易漂移的 package inventory。

`packages/<owner>` 是正式 Module Boundary。它可以依真實責任包含：

```text
src/
├─ domain/        # pure business rule，只有需要時存在
├─ application/   # use case / query / orchestration
├─ contracts/     # real public/port contract
├─ adapters/      # DB/provider/runtime implementation
├─ agents/        # owner-specific AI extraction/draft
└─ testing/       # explicit test-only support
```

這是 responsibility vocabulary，不是 folder quota。沒有責任就不建 layer。

## Web source

`apps/web/src` 的三個 source 區域：

| Zone | Responsibility |
| --- | --- |
| `app/` | Next.js route、layout、HTTP delivery、最外層 composition |
| `modules/` | feature presentation / interaction / HTTP projection |
| `shared/` | 無 business authority、修改原因真正相同的 Web mechanism |

`app/api/_composition` 可接 concrete adapters，但不是第二個 application layer或 service locator。Web module 不因頁面不同複製 package-owned business logic。

## Placement

新增或搬檔先問「誰負責」，不問「哪裡比較方便 import」。

| Responsibility | Default owner |
| --- | --- |
| business invariant / state transition / value validation | `packages/<owner>/src/domain` |
| use case / query / orchestration / consumer port | `packages/<owner>/src/application` |
| owner-specific database adapter | `packages/<owner>/src/adapters` |
| LINE / Google provider protocol | owning integration package |
| neutral runtime / persistence mechanism | `packages/platform` |
| owner-specific AI extraction / draft | `packages/<owner>/src/agents` |
| feature Web presentation / interaction | `apps/web/src/modules/<feature>` |
| URL / layout / route handler / outer composition | `apps/web/src/app` |
| shared Web mechanism without feature rule | `apps/web/src/shared` |
| repository/provider operation orchestration | `scripts/<responsibility>` |
| provider/capability asset | `assets/<provider>/<capability>` |

跨 owner 只依賴對方 public contract；不得把 producer private model 搬進 consumer，也不得因 cycle 建 `common`/facade 隱藏真正 owner 問題。

## New package decision

新增 workspace package 必須有現有 owner 無法合理承接的獨立 source responsibility，而且 package boundary 能提供真實 dependency/public-surface/runtime value。以下都不是充分理由：

- 檔案數增加；
- GitHub/FPT/UI 有同名概念；
- 想讓 Bounded Context、package、table 1:1；
- 未來可能有第二 consumer/implementation；
- 只想少寫相對路徑或讓目錄對稱。

若責任存在但不需要獨立 package，先放真正 owner 的必要 subdirectory。

## Validation

語意／ownership 變更先改 `architecture/semantic-model.json`；module/dependency 變更改 `implementation-topology.json`；data ownership 變更改 `data-topology.json` 與 SQL owner。完成後使用 root canonical validation；database、deployment、provider、device evidence 另行證明。
