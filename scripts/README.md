# 專案腳本

`package.json#scripts` 是人、Agent、CI 共用的 public command surface；`scripts/` 是 private repository-operation implementation。CLI 只負責 deterministic operation orchestration，不承擔產品 domain rule 或第二份 source of truth。

## Responsibility layout

The first-level structure separates repository mechanisms, architecture authority,
analysis, change lifecycle, business operations, provider adapters and governance.
Moving an operation requires its real consumers, package command, workflow routing,
tests, documentation, architecture projection and tooling guards to move together.

```text
core/          repository-wide execution mechanisms and bounded output
architecture/  canonical architecture loading, semantic analysis and validation
analysis/      read-only code facts, insights and intelligence analysis
changes/       change status, preflight, patch application and finalization
operations/    business/application operation entrypoints
providers/     provider adapters, probes and provider-specific reconciliation
governance/    command, documentation, workflow and validation governance
```

The layout is responsibility-oriented, not a mandate to create empty layers. Each
operation keeps one authoritative owner, one observable result and a small interface.
Shared mechanisms exist only for real consumers; generic wrappers, managers, helpers,
aliases and compatibility directories do not qualify as a migration strategy.

During migration, `package.json#scripts` remains the public command surface. Existing
command names, argv contracts, observable output, authorization, side effects and
readback remain stable unless their contract is intentionally changed. `.github/` and
`scripts/` are one operation system: workflows own GitHub setup and routing, while
scripts own tested operation behaviour.

- 一般 command 從 repository root 執行；完整 merge validation 使用 `pnpm validate`。
- Read-only validation、live probe、local mutation、remote mutation 的 evidence 分開。
- `scripts/README.md` 與 `scripts/AGENTS.md` 是 scripts 唯一的文件入口；子目錄不得放置 `README.md` 或 `AGENTS.md`。`tooling:check` 會驗證此 invariant。
- 外部 provider mutation 必須 explicit authorization + exact target + bounded failure + post-write readback。
- 修改 script 時同步更新 command surface、測試、validation routing、workflow 與根層 scripts 文件。

| Group | Responsibility |
| --- | --- |
| `core/` | Runtime bootstrap, bounded output and validation execution mechanisms. |
| `architecture/` | Machine-readable architecture compile/query/validation. |
| `analysis/` | Code facts and read-only insights analysis. |
| `changes/` | Change status/preflight/finalize and deterministic patch application. |
| `operations/` | Attendance, actions, contract, execution, file, intelligence, project, WBS and wiki entrypoints. |
| `providers/` | Browser scenarios, GitHub routing/readback, LINE, probes, Supabase and Vercel adapters. |
| `governance/` | Documentation validation, toolchain governance, developer doctor and validation orchestration. |

## 高頻開發入口

```text
pnpm tooling:doctor
pnpm skills:list
pnpm code --help
pnpm code facts --scope packages/repository/src
pnpm change:status
pnpm semantic plan "<intent>"
pnpm change:preflight
pnpm check
pnpm change:finalize
```

Semantic impact authority 位於 architecture semantic system，統一使用 `pnpm semantic plan`。工具與委派選擇見 [development workflow](../docs/reference/engineering/development-workflow.md#autonomous-tool-selection)。正式 Rich Menu 圖片位於 `assets/line/rich-menu/`，不與 scripts 混放。

## 發布工作流程

1. `github/release-plan.mjs` 讀取 exact main SHA 與各 operation 最近成功的 ancestor job，產生 pending-source 判斷；不寫 provider。
2. `tooling/validate.mjs` 執行相同 SHA 的完整驗證；CI 分 runner，本機依序執行，避免產物競爭。
3. `github/current-main.mjs` 在 resource lock 內確認待發布 revision 仍是 main。
4. LINE、Supabase、Vercel、Attendance 各自執行完整 operation 與 readback；只有真實 dependency 才等待。

| 輸入 | 流程 | 成功條件 |
| --- | --- | --- |
| `assets/line/rich-menu/*` 與 publication code | `line:rich-menu publish all` → preflight → create/upload → aliases/default → readback | LINE definitions、aliases、default 與 desired state 一致；實機另驗。 |
| `packages/integration-supabase/src/schemas/*.sql` | `schema:remote sync` → clean local desired DB → remote diff → transaction apply → second diff/readback | schema drift = 0、ownership/security PASS、migration history 不變。 |

本機可用 `pnpm line:rich-menu preview all` 檢查素材；`schema:remote plan`／`verify` 是 read-only 遠端診斷，但會重建 disposable local Supabase database，需要 Docker。Production mutation 由 [GitHub workflow](../.github/README.md) 執行。
