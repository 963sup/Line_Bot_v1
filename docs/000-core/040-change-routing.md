# Change routing

任務先定位 owner，再讀最少必要 context。

```text
Change intent
↓
pnpm semantic plan "<intent>" 或本表
↓
1 個 owner / concern document
↓
nearest AGENTS.md
↓
Code / Schema / Manifest
↓
canonical validation
```

`semantic plan` 是 deterministic navigation，不取代實際 consumer、source、tests 與 current-state核對。

## Business owner routing

| 問題 | Canonical human owner | Implementation / local rules |
| --- | --- | --- |
| Account / User / qualification / external identity | [Account](../010-domain-owners/010-account.md) | `packages/account` |
| Enterprise governance | [Enterprise](../010-domain-owners/020-enterprise.md) | `packages/enterprise` |
| Organization governance / participation | [Organization](../010-domain-owners/030-organization.md) | `packages/organization` |
| Employment / terms / schedule | [Workforce](../010-domain-owners/040-workforce.md) | `packages/workforce`; activation另看 Governance |
| Attendance / Workplace | [Attendance](../010-domain-owners/050-attendance.md) | `packages/attendance` |
| Payroll | [Payroll](../010-domain-owners/060-payroll.md) | `packages/payroll` |
| Team / TeamMembership | [Team](../010-domain-owners/070-team.md) | `packages/team` |
| Repository / Issue / Discussion / Label / Repository Milestone / Star | [Repository](../010-domain-owners/080-repository.md) | `packages/repository` |
| Notifications | [Notifications](../010-domain-owners/090-notifications.md) | `packages/notifications` |
| Expense | [Expense](../010-domain-owners/100-expense.md) | `packages/expense` |
| Partners / Contacts / Referrals | [Partners](../010-domain-owners/110-partners.md) | `packages/partners` |
| Assistant / AI draft orchestration | [Assistant](../010-domain-owners/120-assistant.md) | `packages/assistant` |
| Asset definition | [Asset](../010-domain-owners/130-asset.md) | `packages/asset` |
| Wallet holding / balance projection | [Wallet](../010-domain-owners/140-wallet.md) | `packages/wallet` |
| Ledger append-only value facts | [Ledger](../010-domain-owners/150-ledger.md) | `packages/ledger` |
| DailyCheckIn | [DailyCheckIn](../010-domain-owners/160-daily-check-in.md) | `packages/daily-check-in` |
| Project / Project Item / WBS / Project Milestone | [Project](../010-domain-owners/180-project.md) | `packages/project`; runtime activation另看 Governance |
| Cross-owner namespace / locator collision policy | [Namespace](../010-domain-owners/190-namespace.md) | `packages/namespace` |

## Platform / security / data routing

| 問題 | Canonical owner | Implementation / evidence |
| --- | --- | --- |
| LINE Login / MINI App / Webhook / Messaging / Rich Menu | [LINE](../030-platform/010-line.md) | `packages/line-channel` + Web / provider readback |
| Supabase provider / remote DB operation | [Supabase](../030-platform/020-supabase.md) | `supabase/AGENTS.md`; data semantics仍回 `040-data` |
| Redis coordination / cache mechanism | [Redis](../030-platform/030-redis.md) | `packages/platform` when applicable |
| Vercel runtime/deployment | [Vercel](../030-platform/040-vercel.md) | Web runtime + provider readback |
| Google Workspace | [Google Workspace](../030-platform/050-google-workspace.md) | `packages/google-workspace` |
| AI provider | [AI](../030-platform/060-ai.md) | business owner仍是 consuming application/domain |
| Sentry / runtime errors | [Sentry](../030-platform/070-sentry.md) | `apps/web` runtime boundary |
| Data owner / persisted facts | [Data boundary](../040-data/010-data-boundary-model.md) | `architecture/data-topology.json` + `supabase/schemas/` |
| Transaction / version / replay / idempotency | [Transaction](../040-data/040-transaction-and-idempotency.md) | owning application + schema/adapter enforcement |
| Identity mapping | [Identity mapping](../040-data/050-identity-mapping.md) | owner adapter / persisted mapping |
| Authentication | [Authentication](../050-security/020-authentication.md) | proof != authorization |
| Authorization / scoped permission | [Authorization](../050-security/030-authorization.md) | `packages/identity-access` + owning policy |
| Tenant/data isolation | [Scope and isolation](../050-security/040-scope-and-data-isolation.md) | application decision + DB defense in depth |
| Audit | [Audit](../050-security/060-audit.md) | `packages/audit` foundation + evidence consumers |

## Architecture / engineering / operations routing

| 問題 | 先讀 | Machine / operational owner |
| --- | --- | --- |
| Business semantic / new boundary | [Domain map](020-domain-map.md) + affected owner | `architecture/semantic-model.json` |
| Cross-owner relationship / SSOT | [Repository map](030-repository-map.md) | semantic/module/data topology |
| Repository structure | [Repository architecture](../020-architecture/010-repository-architecture.md) | actual tree / workspace manifests |
| Hexagonal placement | [Hexagonal architecture](../020-architecture/020-hexagonal-architecture.md) | owning package source |
| Module/public surface | [Module boundaries](../020-architecture/030-module-boundaries.md) | implementation topology + exports |
| Dependency direction | [Dependency rules](../020-architecture/040-dependency-rules.md) | executable architecture guards |
| Runtime/Web composition | [Runtime architecture](../020-architecture/050-runtime-architecture.md) | `apps/web` + runtime config |
| Validation meaning | [Validation](../060-engineering/040-validation.md) | root canonical commands |
| Deployment / release / recovery | [Operations](../070-operations/README.md) | provider/release evidence |
| Target / migration / gap / risk / dated acceptance | [Governance](../090-governance/README.md) | never overrides current owner |

## Stop rule

當 Owner、Truth、Boundary、Invariant、Validation 已唯一，就停止；不要因「全盤理解」而載入無關文件。
