# Enterprise / Organization gaps

只保留目前仍未完成、且會影響 activation / acceptance 的缺口。Account/User、Enterprise/Organization governance、Enterprise Team provenance 與 Organization-scoped Team 的 current rules 回各 Domain owner，不在本檔重抄。

| ID | Open gap | Completion condition |
| --- | --- | --- |
| EO0 | Legacy Member/membership wire/storage compatibility 尚未完全退役 | 每個 remaining consumer 有 owner、versioned rollout/readback；無 dual writer；immutable history仍可解釋 |
| EO1 | Enterprise / Organization governance 缺 current release/device/business acceptance | 以 current revision/environment 驗 lifecycle、admin/revoke/version/replay、cross-scope negative cases、recovery 與 device flow |
| EO2 | 既有 Workplace/Project/Attendance 的 Organization/Employment provenance 尚未完整 | 每個 resource/history 有 authoritative mapping 或 explicit unresolved state；不得由 Team/LINE group/default Organization 猜值 |
| EO3 | Outside collaborator/resource access / extended Enterprise Team administration 尚無真實 consumer | 只有出現 resource/role/license/ruleset consumer 後才定 owner/public contract/principal policy/revoke/audit；不預建 generic framework |
| EO4 | EnterprisePolicy / OrganizationPolicy 沒有 downstream configurable-rule consumer | 第一個真實 rule/consumer 出現後再定 version/effective/applicability/decision trace |
| EO5 | Personal Center multi-scope projection 尚未接通 | 只組合 owner-approved Account/Wallet/Organization/Employment/Attendance/Payroll projections；驗 privacy、partial failure、scope switch |
| EO6 | 後續 schema slice 的 remote convergence / deployment evidence 尚未完成 | 每個 slice 以 current target 做 preserve-data plan、catalog/security readback、data parity、deployment/device evidence |

## Activation decisions

仍需產品明確決定的只有：

1. Employment 建立是否要求 active OrganizationMembership，以及 overlapping Employment policy。
2. Employment ended／participation removed 後的 Workforce/Payroll historical self-read policy。
3. 非 USER holder、transfer、autonomous Bot actor 或 outside-collaborator capability是否有真實 consumer；沒有就不啟用。

Current operational target、remote parity、backup/recovery 必須每次操作前 live readback；任何 dated acceptance 不可代替。

完成項直接刪除，不保留「曾經是 gap」的敘述。
