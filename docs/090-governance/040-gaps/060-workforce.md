# Workforce / calendar / employment gaps

只保存 Workforce 尚未完成的項目與 completion condition。模型／invariant 由 [Workforce rules](../../010-domain-owners/040-workforce.md) 擁有；實作順序、activation gate 與 rollback 由 [Migration slices](../030-migrations/040-enterprise-organization-workforce-payroll.md#workforce--attendance--payroll-implementation-slices) 擁有。

Current Attendance actual stream 仍是 Member-compatible contract；Workforce/Employment、calendar/schedule、Attendance Employment handoff 與正式 Payroll 尚未全部落地。

| ID | Gap | Completion condition |
| --- | --- | --- |
| WC0 | Workforce-facing Organization scope / employment authority 尚未形成可用 contract | current UserId + OrganizationAccountId 可權威解析；cross-scope 拒絕；unknown history/provenance 可表示；不建立 generic AccountRelation fallback |
| WC1 | Employment lifecycle／persistence／authority 未實作 | create/suspend/resume/end、effective period、participation/overlap policy、version/replay/audit 與同人多 Organization/重新到職案例 |
| WC2 | EmploymentTerms／WorkPolicy／Calendar／Schedule versioned inputs 未實作 | 按真實 consumer 建 source/version、publish/correction、missing/conflict、不同制度與跨日案例 |
| WC3 | Current Attendance 與 Employment 歷史／命令接續未完成 | evidence-backed mapping、unresolved provenance、open session、command scope、request/receipt/version/reward/outbox/recovery 通過；單一 writer cutover |
| WC4 | 法規／制度 applicability 未完成 | 每啟用 rule 有 authoritative source、effective/applicability、rounding 與 positive/negative cases |
| WC5 | Payroll 正式 capability 未完成 | versioned inputs、PayrollRun/PayStatement lifecycle、authorization、finalize/correction/replay/publication 完整；詳見 [Payroll gaps](090-payroll.md) |

Employment pure domain/contract/tests 可先實作；第一個 create/mutate entry 啟用前必須完成 WC0/WC1 所需 authority、participation、overlap、replay/version 決策。缺 required scope/fact 時保持 fail closed。

已完成的 Team source/schema/contracts 不再列為 Workforce gap；historical `WorkGroup` literal 只在 evidence/protocol 需要時保留。以上 completion condition 不是已通過 evidence。
