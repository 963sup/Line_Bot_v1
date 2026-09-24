# Attendance employment-scope target design

狀態：已選定 target decision，尚未實作Employment cutover。Current Attendance仍是Member-scopedstream；[Account decision](070-account-identity-design.md) 不把它機械改成genericAccount-scopedattendance。

## Decision / purpose

Actual工作事實以EmploymentId定位特定工作關係，同一User可有多個Employment。PrincipalId表示實際操作者，OrganizationAccountId表示scope，UserId表示人類subject/recipient；這些角色不混用。

Workforce提供scheduled/applicableversions；Attendance提供actualfacts/corrections/finalizedAttendancePeriodVersion；Payroll消費immutableinput。沒有open session不表示periodcomplete，elapsedtime也不等於法定工時。

## Preserved invariants and rationale

同一Employment最多一open session，sessions不重疊，end不早於start。跨Organization的Workplace/Employment/session/version不能拼接。Correction保留原fact/version，Payroll引用的舊input不被覆寫。

未知historicalEmployment保留unresolvedprovenance，不以現在Team/Workplace/Organization猜測。AccountID continuity、old receipts/outbox、reward日界線與原per-humanorigin key保留；多Employment不自動增加每日獎勵領取次數。

## Canonical contracts

- [Attendance target rules](../../010-domain-owners/050-attendance.md)：state、clock/correction/finalize、self/managementboundary、failure與acceptance。
- [Workforce](../../010-domain-owners/040-workforce.md)：effectiveEmployment/schedulepolicy。
- [Consistency](../020-proposals/010-domain-target.md)：stream/periodboundary。
- [Public contract](../020-proposals/010-domain-target.md)：projection與ports。
- [Authorization](../020-proposals/040-security-target.md)、[Audit](../020-proposals/040-security-target.md)：actualPrincipal、sensitivecorrection、scope/revoke。
- [Persistence](../020-proposals/030-data-target.md)：singlewriter、history、receipts與transaction。
- [Events](../020-proposals/010-domain-target.md)：AttendancePeriodFinalized只在實際consumer需要時部署。

## Remaining activation decisions

同人多activeEmployment的clockscope選擇、correction/finalization最小管理用例、legacyopen-sessionmapping、unresolved歷史的read/正式Payrolleligibility，必須在入口啟用前由owner定案；UI preference不能當authority。

Bot不能因AccountKind自行替人clock；delegated入口要獨立use case/credentials/permission/tests。TeamManager或OrganizationMembership不自動等於correctionauthority。

## Verification / migration

先建立可信Employment/Organizationrelation，再切workingstream；legacy/newwriter不得各建一筆session。Same-request/staleversion/unknown-result、並行scope、currentqualification、Workplace、reward、outbox、correction/finalizedversion皆需positive/negative驗證。

[Migration stages](../030-migrations/040-enterprise-organization-workforce-payroll.md) 擁有實作順序與data/recoverygate，不以舊Phase3/4文字當currentplan。沒有實際source/schema/remoteevidence，仍是target。

## Deferred

完整法定工時計算、自動曠工/加班、genericcorrectionDSL、clockeventbus不因本次identity設計預建。
