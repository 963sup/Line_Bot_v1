# Change routing

先按問題找 canonical owner；只讀完成任務需要的下一層。跨 owner、語意或 architecture-sensitive change 可先用 `pnpm semantic plan "<intent>"` 做 deterministic preprocessing；`no-match`／`ambiguous` 才回本表與 owner docs 解歧義。外部現況已取得可引用 observation bundle 時，用 `pnpm semantic feedback <bundle.json>` 比較 design 與 reality；feedback 只產生 derived revision proposal，不自動改 semantic authority。一般 hot path 應是：

```text
Change Intent
↓
semantic plan / 本表找到 owner
↓
1 個 owner / concern 文件
↓
nearest AGENTS
↓
code / schema / implementation topology
↓
canonical validation
```

不要先展開整套 docs。

## Domain / business routing

| 問題 | 先讀 | Implementation / local rules |
| --- | --- | --- |
| Strategic DDD / 新 business boundary / ownership / integration design | [Strategic design](070-strategic-design/README.md) | 再回 Domain Map / Repository Map / owner；不先建 package |
| Account / User / qualification / external identity link | [Account](../010-domain-owners/010-account.md) | `packages/account` + nearest AGENTS |
| Enterprise governance | [Enterprise](../010-domain-owners/020-enterprise.md) | `packages/enterprise`；authorization/data only when affected |
| Organization governance / participation | [Organization](../010-domain-owners/030-organization.md) | `packages/organization`；scope/security only when affected |
| Workforce / Employment | [Workforce](../010-domain-owners/040-workforce.md) | owner + Governance migration/gaps |
| Attendance / Workplace | [Attendance](../010-domain-owners/050-attendance.md) | `packages/attendance` + local AGENTS |
| Payroll | [Payroll](../010-domain-owners/060-payroll.md) | `packages/payroll` + local AGENTS |
| Team / TeamMembership | [Team](../010-domain-owners/070-team.md) | `packages/team` + Identity/Access when role assignment affected |
| Repository / Issues | [Repository](../010-domain-owners/080-repository.md) | `packages/repository` + Team public decision contract |
| Notifications | [Notifications](../010-domain-owners/090-notifications.md) | `packages/notifications` |
| Expense / receipt intake | [Expense](../010-domain-owners/100-expense.md) | `packages/expense` + local AGENTS when present |
| Partners / Referrals | [Partners](../010-domain-owners/110-partners.md) | `packages/partners` |
| Assistant / AI draft orchestration | [Assistant](../010-domain-owners/120-assistant.md) | `packages/assistant` + AI platform only when provider behavior affected |
| Asset definition / denomination | [Asset](../010-domain-owners/130-asset.md) | `packages/asset` |
| Wallet holding / balance projection | [Wallet](../010-domain-owners/140-wallet.md) | `packages/wallet` |
| Ledger value facts / posting | [Ledger](../010-domain-owners/150-ledger.md) | `packages/ledger` + transaction concern when atomicity affected |
| DailyCheckIn | [DailyCheckIn](../010-domain-owners/160-daily-check-in.md) | `packages/daily-check-in` + Account qualification / Ledger contract |

## Platform routing

| 問題 | Canonical owner | Implementation / evidence |
| --- | --- | --- |
| LINE Login / MINI App / Webhook / Messaging / Rich Menu | [LINE](../030-platform/010-line.md) | `packages/line-channel`, Web delivery, `scripts/line` / provider readback as applicable |
| Supabase platform / remote DB provider behavior | [Supabase](../030-platform/020-supabase.md) | `supabase/AGENTS.md`; Data semantics still go to `040-data` |
| Redis coordination / cache mechanism | [Redis](../030-platform/030-redis.md) | `packages/platform` / local AGENTS when applicable |
| Vercel runtime / deployment provider | [Vercel](../030-platform/040-vercel.md) | Web runtime + deployment/readback |
| Google Workspace / OAuth / provider API | [Google Workspace](../030-platform/050-google-workspace.md) | `packages/google-workspace` + provider evidence |
| AI provider / model usage | [AI](../030-platform/060-ai.md) | Assistant/application consumer remains business owner |
| Sentry / error observability provider | [Sentry](../030-platform/070-sentry.md) | `apps/web` runtime boundary; not Domain packages |

## Data / security routing

| 問題 | Canonical owner | Implementation / local rules |
| --- | --- | --- |
| Data owner / persisted facts | [Data boundary model](../040-data/010-data-boundary-model.md) | `supabase/schemas/` owner file + `supabase/AGENTS.md` |
| Authority vs cache/projection/coordination | [Persistence model](../040-data/020-persistence-model.md) | choose minimum state type; provider docs only after semantic decision |
| Schema ownership / evolution | [Schema model](../040-data/030-schema-model.md) | `supabase/schemas/` is current DB structure SSOT |
| Transaction / expectedVersion / replay / idempotency | [Transaction and idempotency](../040-data/040-transaction-and-idempotency.md) | owning application + schema / adapter enforcement |
| LINE/User/Principal/Employment ID mapping | [Identity mapping](../040-data/050-identity-mapping.md) | owner-specific adapter / persisted mapping |
| Cache / derived read model | [Cache and projections](../040-data/060-cache-and-projections.md) | must remain derivable; never become second writable truth |
| Retention / lifecycle | [Retention and lifecycle](../040-data/070-retention-and-lifecycle.md) | business/legal owner + storage implementation |
| Trust boundary / external input | [Trust boundaries](../050-security/010-trust-boundaries.md) | delivery / adapter boundary |
| Authentication / identity proof | [Authentication](../050-security/020-authentication.md) | proof != authorization |
| Authorization / feature permission / scoped decision | [Authorization](../050-security/030-authorization.md) | Identity/Access + owning business policy |
| Tenant / scope / data isolation | [Scope and data isolation](../050-security/040-scope-and-data-isolation.md) | application decision + RLS/grants defense-in-depth |
| Secrets / credentials | [Secret handling](../050-security/050-secret-handling.md) | provider/runtime secret store |
| Audit semantics / access | [Audit](../050-security/060-audit.md) | owner evidence + controlled projection |

## Architecture / engineering / operations routing

| 問題 | 先讀 | Machine / operational owner |
| --- | --- | --- |
| Repository structure | [Repository architecture](../020-architecture/010-repository-architecture.md) | actual tree / workspace manifests |
| Hexagonal layer / Port / Adapter placement | [Hexagonal architecture](../020-architecture/020-hexagonal-architecture.md) | owning package source |
| Semantic owner / cross-context impact / change plan | [Repository map](030-repository-map.md) | `architecture/semantic-model.json` + `pnpm semantic <verb>` |
| Module/public surface | [Module boundaries](../020-architecture/030-module-boundaries.md) | `architecture/implementation-topology.json` + package exports |
| Dependency direction / deep import | [Dependency rules](../020-architecture/040-dependency-rules.md) | manifest + dependency/architecture guards |
| Web/runtime composition | [Runtime architecture](../020-architecture/050-runtime-architecture.md) | `apps/web` + provider/runtime config |
| Quality attribute trade-off | [Quality attributes](../020-architecture/060-quality-attributes.md) | affected owner + evidence |
| Local environment | [Local environment](../060-engineering/010-local-environment.md) | root package/toolchain truth |
| Development / commit workflow | [Development workflow](../060-engineering/020-development-workflow.md) | Git / repository policy |
| Testing strategy | [Testing strategy](../060-engineering/030-testing-strategy.md) | owning tests |
| What validation to run / what evidence means | [Validation](../060-engineering/040-validation.md) | root canonical commands |
| Code quality | [Code quality](../060-engineering/050-code-quality.md) | compiler/linter/Knip/etc. |
| Architecture enforcement | [Architecture guards](../060-engineering/060-architecture-guards.md) | executable guards / CI |
| Deployment | [Deployment](../070-operations/010-deployment.md) | provider deployment evidence |
| Release | [Release](../070-operations/020-release.md) | release gates / readback |
| Recovery | [Recovery](../070-operations/030-recovery.md) | backup/rollback/reconciliation evidence |
| Observability | [Observability](../070-operations/040-observability.md) | runtime/provider telemetry |
| Remote mutation / external change | [External change control](../070-operations/050-external-change-control.md) | explicit target + precondition + write + readback |
| Decision / proposal / migration / gap / risk / evidence / history | [Governance](../090-governance/README.md) | never overrides current canonical owner |

## Stop rule

當任務已能唯一定位：

```text
Owner
+ Truth
+ Boundary
+ Invariant
+ Validation
```

就停止擴張閱讀面。只有跨 owner、語意衝突或 architecture decision 才回 [Domain map](020-domain-map.md)、[Repository map](030-repository-map.md) 或完整 [Strategic design](070-strategic-design/README.md)。
