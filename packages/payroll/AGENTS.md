# @line-work/payroll

- 本 package 是 Payroll 程式 owner；業務契約見 [Payroll rules](../../docs/010-domain-owners/060-payroll.md)，current foundation 與未完成能力見 [Payroll gaps](../../docs/090-governance/040-gaps/090-payroll.md)。
- Readiness 只聚合 versioned Workforce、AttendancePeriod 與 payroll rule inputs；缺任何 required input 必須 fail closed。
- PayPeriod 必須在讀 upstream dependency 前完成格式與範圍驗證；duplicate rule version、空 version/source ID 必須拒絕。
- Readiness 評估本身保持無寫入／無授權副作用，不因 ready=true 建立 PayrollRun/PayStatement、計算正式薪資或授予 permission；ready 也不代表公式適用性、scope 與 upstream provenance 已驗證。
- 後續 calculation、lifecycle、persistence 與 publication 可依 [Migration slices](../../docs/090-governance/030-migrations/040-enterprise-organization-workforce-payroll.md#workforce--attendance--payroll-implementation-slices) 在本 owner 實作；啟用前逐項滿足 Payroll gaps 的 input、policy、authorization、audit/correction 與驗收條件，不能靠縮減 required inputs 或假公式繞過。
