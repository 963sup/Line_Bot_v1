# Governance

Governance 只保存仍會影響未來 decision、cutover、open gap、risk 或可重現 acceptance 的 change-over-time knowledge；不成 current product / architecture 的第二份 truth。

- `010-decisions/`：已選定、仍有未來決策價值的 rationale / target direction。
- `020-proposals/`：尚未升格為 current truth、且仍有真實 consumer / activation question 的 proposal。
- `030-migrations/`：仍需執行或驗證的 cutover。
- `040-gaps/`：仍未完成的事項與 completion condition。
- `050-risks/`：active risk。
- `060-acceptance/`：具日期、revision、環境與範圍，且仍能支援 recovery / regression / release 判斷的 evidence。

Raw historical logs、已退役 current baseline、完成且沒有 recovery value 的 migration、無 consumer 的 speculative target 不留在 current tree。原始內容需要追溯時由 Git history 取得，不建立 `090-history/` 第二套知識面。

完成 migration 或 proposal 被 current owner 吸收後，仍成立的 truth 蒸餾回 `000-core/`、`010-domain-owners/` 或 machine source；其餘刪除。Acceptance 只證明指定 revision / environment，不得用舊環境推導 current operational target。
