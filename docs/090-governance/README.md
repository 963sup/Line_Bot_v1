# Governance

Governance 只保存 change-over-time knowledge，不成 current product / architecture 的第二份 truth。

- `010-decisions/`：已選定的設計 rationale / future direction。
- `020-proposals/`：尚未升格為 current truth 的提案。
- `030-migrations/`：從 current 到 selected design 的 cutover。
- `040-gaps/`：仍未完成的事項與完成條件。
- `050-risks/`：active risk。
- `060-acceptance/`：具日期、revision、環境與範圍的 evidence。
- `090-history/`：只保留追溯 / recovery 價值的歷史。

完成 migration 後，仍成立的 current truth 必須蒸餾回 `000-core` / owning canonical document；不要讓 Governance 永久變成第二套 current baseline。
