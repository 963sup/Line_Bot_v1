# LINE 工作助手

TypeScript／pnpm monorepo，使用 Next.js、LINE MINI App 與 Supabase，提供 Enterprise／Organization governance、Team collaboration、Repository／Issue 工作管理、出勤、費用整理、通知與其他企業營運能力。Assistant 可以回答問題與產生草稿，但 AI output 不直接形成正式 business write；Expense confirmed 也不代表 approval、payment 或 accounting posted。各能力的 current implementation、target 與驗收範圍見 [文件入口](docs/README.md)。

## 架構

本專案採 Context-first Modular Monolith。DDD 用來界定 business language、ownership 與 Bounded Context；Hexagonal Ports/Adapters 用來維持 owner 內部的 dependency direction 與 external technology boundary。現有 ownership 與 implementation topology 見 [Repository structure](docs/020-architecture/010-repository-architecture.md)。

- `apps/web` 只依賴 owner module 的公開 surface；Module Boundary 不等於 Bounded Context。
- `packages/<owner>` 依真實責任組織 `domain / application / contracts / adapters / agents`；沒有真實用途的 layer 不建立。
- [`architecture/semantic-model.json`](architecture/semantic-model.json) 是 cross-context structured semantics、ownership、relationship、invariant 與 implementation mapping 的 machine-readable source of truth。
- [`architecture/implementation-topology.json`](architecture/implementation-topology.json) 只擁有 implementation topology、module kind 與允許依賴。
- [`architecture/data-topology.json`](architecture/data-topology.json) 擁有 declarative SQL surface 的 Data Boundary、authority role、semantic owner 與 cross-owner participation；實際 table/view/function/constraint/RLS 仍只由 `supabase/schemas/` 擁有。
- [`architecture/semantic-benchmark.json`](architecture/semantic-benchmark.json) 只是 pinned external benchmark，不是產品 authority。
- `pnpm architecture` 同時驗 semantic、module、data 與 benchmark topology，避免任何一層變成平行 truth。

純 ownership 收斂不改既有業務行為；Workforce、Employment-scoped Attendance 與 Payroll 的功能演進另依 [Migration plan](docs/090-governance/030-migrations/040-enterprise-organization-workforce-payroll.md) 分 slice 實作與放行，不把 current 限制當成永久禁止。

## 開始開發

依 [本地開發環境](docs/060-engineering/010-local-environment.md) 準備環境；Node／pnpm 版本以 [package.json](package.json) 為準。從專案根目錄執行：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

開啟 [本機首頁](http://127.0.0.1:3000)。正式模式先執行 `pnpm build` 再執行 `pnpm start`。

| 命令 | 用途 |
| --- | --- |
| `pnpm check` | 日常變更檢查 |
| `pnpm validate` | 完整靜態檢查、測試與建置 |
| `pnpm test:browser` | 本機 production Web，使用合成 LINE／API |
| `pnpm docs:check` | Markdown 與本地檔案連結 |
| `pnpm semantic explain repository` | 查 owner、contracts、boundaries、invariants、implementation mapping 與 evidence |
| `pnpm semantic plan "change intent"` | 從 intent 推導 Owner → Impact → Boundaries → Change Surfaces → Validation |
| `pnpm semantic context "change intent"` | 產生與 task / owner / boundary 直接相關的 authoritative context slice |
| `pnpm semantic view docs` | 從 canonical model 產生 glossary／contracts／invariants／capabilities／evidence／diagram read model |
| `pnpm semantic feedback <bundle.json>` | 將 runtime/provider/deployment/device/human observation 與 canonical capability expectation 比較，輸出 drift/review 與 derived revision proposal |
| `pnpm build`／`pnpm start` | 建置／啟動正式模式 |

## 程式與文件入口

- `apps/web`：網頁及 HTTP 入口；`packages/<context>`：各業務能力的公開入口；跨 package consumer 只使用 owner 的 public exports。程式責任見 [Monorepo](docs/020-architecture/010-repository-architecture.md)，依賴方向見 [Dependencies](docs/020-architecture/040-dependency-rules.md)。
- [文件索引](docs/README.md)：按功能尋找唯一主文件；Web runtime 與 route responsibility 見 [Web runtime](docs/020-architecture/050-runtime-architecture.md)。
- [AGENTS](AGENTS.md)：AI 修改約束；[腳本索引](scripts/README.md)：本機與外部操作入口。
- [Release](docs/070-operations/020-release.md) 與 [Recovery](docs/070-operations/030-recovery.md)：部署放行與復原程序；[Acceptance evidence](docs/090-governance/060-acceptance/010-acceptance-evidence.md)：具日期證據的索引與限制。

本機驗證不代表遠端 migration、LINE 選單發布或手機驗收完成。
