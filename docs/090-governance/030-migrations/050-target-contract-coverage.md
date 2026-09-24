# Account / governance / Workforce target contract coverage

狀態：責任 routing 與 gate checklist，不是 implementation/schema/remote/deployment 完成證據。Current 狀態由 source/current-state 文件決定；本表避免把早期 target baseline 凍結成永久「未實作」。

| # | Concern | Canonical owner | Current / gate summary |
| ---: | --- | --- | --- |
| 1 | Domain | [Domain map](../../000-core/020-domain-map.md) | Enterprise Workforce & Operations Management；Account 是 identity foundation |
| 2 | Purpose | [Product experience](../../000-core/060-product-experience.md) | 協作／任職／出勤／薪資／營運；未交付能力不冒充完成 |
| 3 | Context | [Contexts](../../090-governance/020-proposals/010-domain-target.md) | Account/Enterprise/Organization/Team 已有 current source；Workforce/Payroll 按 gate |
| 4 | Ubiquitous Language | [Glossary](../../000-core/050-glossary.md) | User current；Member/WorkGroup 僅 compatibility/history；Employment target |
| 5 | Responsibilities | [Modules](../../010-domain-owners/README.md) | lifecycle、DailyCheckIn、Team、Attendance、Payroll owner 分開 |
| 6 | Out of Scope | [Account ADR](../010-decisions/070-account-identity-design.md) | 無 universal AccountRelation/generic IAM/假 ERP framework |
| 7 | Boundary | [Module contracts](../../090-governance/020-proposals/010-domain-target.md) | Bounded Context、Module、Data Boundary 不強制 1:1 |
| 8 | Owned Model | [Repository map](../../000-core/030-repository-map.md) | current owner 以 source 為準；target 不建立 duplicate writer |
| 9 | Aggregates | [Consistency](../../090-governance/020-proposals/010-domain-target.md) | invariant/transaction 決定，不用 folder/table 決定 |
| 10 | Data Ownership | [Data model](../../090-governance/020-proposals/030-data-target.md) | actor/subject/holder/scope/Employment 分開 |
| 11 | Current / Target Owner | [Repository map](../../000-core/030-repository-map.md) | User、Team current；Employment/正式 Payroll target；compat literals不升格 owner |
| 12 | Invariants | 各 module rules | ID/history continuity、kind/scope、grant/reward/replay invariant 不放寬 |
| 13 | Authority | [Authorization](../../090-governance/020-proposals/040-security-target.md) | proof→Principal→qualification/role→scope→invariant；fail closed |
| 14 | Policy decisions | 各 business owner + [ADR](../010-decisions/070-account-identity-design.md) | Policy 內容由 owner；Security/IdentityAccess執行授權 |
| 15 | State model | 各 module rules | User/participation/Employment/Payroll state 不混用 |
| 16 | Commands | 各 module application contract | command actor/subject/scope/replay identity 明確 |
| 17 | Queries | Owner-approved projections | safe projection；無 unrestricted private graph |
| 18 | Public Contract | [Module contracts](../../090-governance/020-proposals/010-domain-target.md) | 最窄 stable ID/decision/command/query surface |
| 19 | Dependencies | [Dependency rules](../../020-architecture/040-dependency-rules.md) | public exports only；無 alias/wrapper 隱藏 owner |
| 20 | Relationships | [Context map](../../090-governance/020-proposals/010-domain-target.md) | typed participation/Employment/role/delegation 各有 owner |
| 21 | Consistency Boundaries | [Consistency](../../090-governance/020-proposals/010-domain-target.md) | cross-owner transaction != merged Aggregate |
| 22 | Event Rules | [Events](../../090-governance/020-proposals/010-domain-target.md) | 有 committed fact + consumer 才建立 event |
| 23 | Target Events | [Events](../../090-governance/020-proposals/010-domain-target.md) | receipt/audit/outbox 不自動變 Domain Event |
| 24 | Integration Contracts | [Platforms](../../030-platform/README.md) | provider proof/delivery 不取代 business authority |
| 25 | Ports | [Module contracts](../../090-governance/020-proposals/010-domain-target.md) | 只有真實 dependency 才建 port |
| 26 | Adapters | [Entrypoints](../../020-architecture/050-runtime-architecture.md) | adapter translation/composition，不取得 business authority |
| 27 | External Platforms | [Platforms](../../030-platform/README.md) | GitHub/Supabase/LINE/Google/AI 只校準 mechanism/protocol |
| 28 | Failure | Owner contracts | not-found/qualification/forbidden/scope/version/replay/unavailable/unknown分開 |
| 29 | Idempotency | [Persistence](../../090-governance/020-proposals/030-data-target.md) | stable request/fingerprint/result；compat tuple/history 不改寫 |
| 30 | Concurrency | [Persistence](../../090-governance/020-proposals/030-data-target.md) | revoke/mutation version/locking；multi-connection evidence另驗 |
| 31 | Security | [Security](../../050-security/README.md) | authentication/qualification/authorization/data boundary/domain invariant 不互代 |
| 32 | Audit | [Target audit](../../090-governance/020-proposals/040-security-target.md) | real Principal/scope/subject/reason/version；Audit read另授權 |
| 33 | Lifecycle | Owner rules | restore/reactivate 不復活 revoked/removed relation |
| 34 | Read Model | [Product experience](../../000-core/060-product-experience.md) | owner-approved projection；partial failure可辨識 |
| 35 | Persistence | [Schema](../../090-governance/020-proposals/030-data-target.md) · [Persistence](../../090-governance/020-proposals/030-data-target.md) | current schema與target tables分開；private grants/RLS保留 |
| 36 | Known Drift | [Gaps](../040-gaps/README.md) | open gaps 只留尚未完成；已完成 User/Team migration 不再當 gap |
| 37 | Migration Plan | [Migration](../030-migrations/040-enterprise-organization-workforce-payroll.md) | D/G/I/S/R/V 按 slice，不是全產品瀑布 gate |
| 38 | Risks | [Risks](../050-risks/010-active-risks.md) | wrong kind/scope、actor/holder混用、stale docs、假完成 |
| 39 | Open Questions | [Workforce gaps](../040-gaps/060-workforce.md) · [Payroll gaps](../040-gaps/090-payroll.md) | 只保留真正 activation decision |
| 40 | Deferred | [Account ADR](../010-decisions/070-account-identity-design.md) | Bot/Managed User/non-USER holder/generic policy/ERP 無需求不預建 |
| 41 | Acceptance | [Migration](../030-migrations/040-enterprise-organization-workforce-payroll.md) · [Acceptance](../060-acceptance/README.md) | static/test/schema/remote/deploy/device/business evidence 分層綁 revision |

## Completion meaning

文件 convergence 只證明 owner/current-target/history routing 一致；不等於 Workforce/Payroll runtime、remote schema 或 device/business acceptance 完成。每個 implementation slice 同步其 AGENTS、owner/current/target docs、consumer refs 與 tests；歷史 acceptance 原文保留，open gap 完成後刪除而不是留「已完成待辦」。
