# Payroll

Read this file for the Payroll owner boundary and invariants. Load [detailed reference](../reference/domains/payroll.md) only for lifecycle / command / locator / policy details.

## Purpose / Model

Payroll回答指定 OrganizationAccount / PayPeriod要計算哪些Employment、每個statement使用哪些versions、薪資結果/lifecycle、finalized correction與哪一版已對User發布。

- PayrollRun：OrganizationAccount + PayPeriod batch lifecycle/version。
- PayStatement：Employment + PayPeriod versioned calculation result。
- Earning/Deduction/GrossPay/NetPay。
- PayrollInputVersion與publication/correction reference。

## Invariants

- PayrollRun scope = OrganizationAccountId + PayPeriod + run version。
- PayStatement scope = EmploymentId + PayPeriod + calculation version。
- 缺required inputs不得FINALIZED。
- PayrollInputVersion pin住source；correction不靜默改寫舊result。
- money precision-safe；Earning/Deduction有classification/source。
- approved/finalized correction走新version/adjustment/reversal。
- request replay不跳過current authorization/lifecycle。

## Authority / input boundaries

Workforce提供EmploymentId / OrganizationAccountId、effective period、terms/policy/schedule versions；Attendance提供finalized period；Finance擁有posting。Payroll不改upstream facts也不宣稱payment/accounting posted。

## Authorization

一般User只讀透過本人Employment有權讀且published的PayStatement。Payroll management/calculate/approve/finalize分離授權；OrganizationMembership、OrganizationAdmin、TeamManager、EnterpriseAdmin都不自動等於Payroll admin。Command actor使用PrincipalId；resource/scope ID只定位不授權。

## Failure / replay / audit

區分not found、Principal forbidden、cross-Organization scope conflict、lifecycle invalid、missing/conflicting input、stale/replay conflict、partial calculation、upstream unavailable、publish precondition、unknown result。高影響operation audit保存PrincipalId、OrganizationAccount scope、reason/version evidence。

## Deferred

未核定台灣稅/勞健保/勞退/加班費公式、bank payment、generic formula DSL、多國Payroll abstraction、Finance private model。
