# Acceptance

具日期、版本、環境、範圍、結果與限制的驗收基線與證據。設計文件不能代替此層的完成判定。

- [Acceptance evidence](010-acceptance-evidence.md)：現行證據使用規則與 validation 類型邊界。
- [Four-model cutover validation — 2026-09-14](060-four-model-cutover-validation.md)：已通過階段、Web 失敗清單、修正經驗與接續條件。
- [GitHub governance semantic / Supabase schema sync — 2026-09-17](070-github-governance-schema-sync.md)：Organization Team／legacy permission semantic cutover 與指定 Supabase project 的 governance/team schema forward sync/readback；EnterpriseTeam 等 explicit gaps 仍分開標示。
- [Atomic declarative schema / remote convergence — 2026-09-18](080-atomic-schema-remote-convergence.md)：owner-based schema source 重排、Permission remote drift data-preserving cutover、catalog/readback 與 validation boundary。
- [Enterprise / Workforce foundation validation evidence — 2026-09-12](020-enterprise-workforce-foundation-static-evidence.md)：Payroll readiness foundation 在指定 revision 的 repository `pnpm validate` 證據；不代表正式 Payroll calculation / deployment / business acceptance。
- [Enterprise / Organization Domain foundation validation evidence — 2026-09-12](030-enterprise-organization-domain-foundation-evidence.md)：Enterprise / Organization / OrganizationMembership 純 Domain lifecycle foundation 的 repository validation；不代表 admin authority、persistence、schema migration 或 deployment 已完成。
- [History](../090-history/)：舊驗收基線與已退役功能的原始歷史輸出；保留當時語境，不作目前 navigation。
