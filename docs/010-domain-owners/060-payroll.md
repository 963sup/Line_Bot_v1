# Payroll

狀態：target business rules，尚未實作／驗收。本文擁有PayPeriod、PayrollRun、PayStatement與薪資result；Workforce/Attendance提供versioned inputs，Finance接收finalized result。

## Purpose / Model

Payroll回答指定 OrganizationAccount / PayPeriod要計算哪些Employment、每個statement使用哪些versions、薪資結果/lifecycle、finalized correction與哪一版已對User發布。

- PayrollRun：OrganizationAccount + PayPeriod batch lifecycle/version。
- PayStatement：Employment + PayPeriod versioned calculation result。
- Earning/Deduction/GrossPay/NetPay。
- PayrollInputVersion與publication/correction reference。

## Commands / Queries

Commands：create/calculate/recalculate/approve/finalize/publish/correct。Queries：OrganizationAccount+PayPeriod status、本人Employment statement、authorized management summary、source trace、Finance finalized projection、missing/conflicts。

## Lifecycle

PayrollRun：DRAFT -> CALCULATING -> CALCULATED -> APPROVED -> FINALIZED。Publication：UNPUBLISHED -> PUBLISHED。Recalculate若input/result改變必須重新review/approval。

## Read model

PayrollRunSummary使用 OrganizationAccountId；PayStatementSelfProjection透過caller UserId -> Employment關係判定本人；source trace保存EmploymentTerms/WorkPolicy/AttendancePeriod/rule versions。Personal Center只有projection authority。

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


## Taiwan regulatory sources

狀態：reference foundation，尚未啟用正式 Payroll calculation。本文只保存首批可追溯官方來源、effective date 與 implementation gate；不代表法規適用性、個案解釋或算薪結果已完成法律／會計驗收。

## Source policy

- 只收官方法規／主管機關來源；新聞、部落格、AI 回答不能成為 PayrollRuleVersion authority。
- 每個正式 calculation rule 必須有 stable `sourceId`、rule version、effective period 與正反案例。
- 外部來源更新不得原地改寫舊 Payroll result；新規則建立新 version。
- 表格式制度（投保級距、負擔比率、職災費率等）使用 versioned table source，不把某一個數字硬寫成全員通用常數。
- 本 registry 與 `@line-work/payroll/domain` 的 rule key 對齊，但 code 目前只做 readiness validation，不執行法規公式。

## 2026 baseline

| Rule key | Source version | Effective from | Verified official basis | Foundation status |
| --- | --- | --- | --- | --- |
| `minimum-wage` | `TW-MOL-MIN-WAGE-2026-01-01` | 2026-01-01 | 勞動部：115 年起每月最低工資 29,500 元、每小時 196 元 | reference-ready；尚未接 wage validation engine |
| `working-time` | `TW-LSA-30-2024-07-31` | current | 勞動基準法第 30 條：正常工時原則每日 8 小時、每週 40 小時；出勤紀錄保存 5 年並記載至分鐘 | reference-ready；彈性工時／例外適用仍未建模 |
| `overtime` | `TW-LSA-24-2024-07-31` | current | 勞動基準法第 24 條：平日延長工時前 2 小時、再延長 2 小時及其他法定情境有不同加給標準 | source-known；正式公式 disabled，須連同休息日／例假／補休等 applicability 建模 |
| `labor-pension` | `TW-LPA-14-2019-05-15` | current | 勞工退休金條例第 14 條：適用勞工之雇主提繳率不得低於每月工資 6% | source-known；正式計算 disabled，須完成適用對象與提繳工資 mapping |
| `labor-insurance` | `TW-BLI-2026-CONTRIBUTION-TABLES` | 2026-01-01 | 勞保局 115 年保險費分擔表、投保薪資分級表；不同身分與職災費率不可共用單一常數 | table-source-known；正式 calculation disabled |
| `health-insurance` | `TW-NHI-2026-CONTRIBUTION-TABLES` | 2026-01-01 | 健保署 115 年投保金額／負擔表；一般保險費率目前為 5.17%，實際負擔仍依身分、投保金額與負擔比率 | table-source-known；正式 calculation disabled |

## Official references

### Minimum wage

- 勞動部「基本（最低）工資的意義」：https://www.mol.gov.tw/1607/28162/28166/28180/28182/28188/29025/
- 勞動部 2026 勞動新制：https://www.mol.gov.tw/1607/1632/1633/87257/

### Working time / overtime

- 勞動基準法：https://laws.mol.gov.tw/FLAW/FLAWDAT01.aspx?id=FL014930
- 第 30 條：https://laws.mol.gov.tw/flaw/FLAWDOC01.aspx?flno=30&id=FL014930
- 正式實作第 24 條時，以同一官方法規系統當時現行條文為 source，並保存引用版本／有效日。

### Labor pension

- 勞工退休金條例第 14 條：https://laws.mol.gov.tw/flaw/FLAWDOC01.aspx?flno=14&id=FL030634

### Labor insurance

- 勞保局一般單位保險費分擔金額表：https://www.bli.gov.tw/0011588.html
- 勞工保險條例：https://www.bli.gov.tw/0014111.htm

### National Health Insurance

- 115 年雇主／自營業主負擔表：https://www.nhi.gov.tw/ch/cp-19439-f2f35-2580-1.html
- 一般保險費計算公式：https://www.nhi.gov.tw/ch/cp-3277-6c895-2588-1.html

## Calculation activation gate

任何 rule 從 `reference-ready / source-known` 升成 production calculation 前，至少要有：

1. 適用 actor / Employment 類型與 exclusion。
2. effective period 與 source version。
3. input mapping（工資、投保薪資、工時、休息日、身分類別等）。
4. precision / rounding contract。
5. 正常案例、邊界案例、反例與歷史重算案例。
6. 與主管機關試算／表格或經確認 benchmark 的 reconciliation。
7. PayrollRun 保存實際使用的 rule versions；舊 finalized result 不因 registry 更新而改變。

## Intentionally not implemented yet

- 不把最低工資直接當作每位員工的實際基本薪資。
- 不以 `8 小時 / 40 小時` 單獨判斷加班或法遵結果。
- 不以單一百分比處理全部勞保、健保或職災情境。
- 不在尚未完成 applicability / source-version / rounding tests 前啟用正式加班、保費、扣繳或淨薪公式。
- 不以本文取代法律、會計或薪資專業人員對正式上線規則的 sign-off。
