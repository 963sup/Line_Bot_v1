# Web team module

## GitHub Mobile 目標（後續實作）

- FPT teams 對應「Organization context → Team 列表 → Team header → members/maintainers 與可用操作」；列表與詳情持續標示 Organization，避免同名 Team 跨 scope 混淆。
- 成員與 maintainer 的 presentation 分開，不能靠 avatar/顏色推定權限；Repository access 不由 Team 頁面自行宣稱。
- EnterpriseTeam 留在 Enterprise 流程；Mobile 的 drill-down 是資訊層次，不建立新的 parent-child Team 關係。

## 現行 surface 與 invariant

Current URL：`/team`（Organization Team 工作台）、`/organizations/{login}/teams/{teamSlug}`（canonical detail）；API `/api/team`。

FPT `schema-teams` 對照 Organization-owned Team；EnterpriseTeam 由 enterprise module 擁有。Team slug 隨 rename 改變、stable TeamId 保留；`/team` 不是單一 Team identity，也不是 Partners 的 parent owner。

改路徑或 scope selector 必須同時驗 Organization qualification、TeamMembership、maintainer invariant、wrong-scope 與 rename 後 URL；不從 Team membership 自動授予 Repository 或全站管理權。

- Owns Team presentation and transport; Team scope, membership and maintainer authority belong to `@line-work/team` and Identity/Access.
- Membership is not permission; selected Team ID and UI role are requested targets, not authority.
- Do not imply Enterprise Team hierarchy or nested Organization Teams until the owner contract and runtime capability exist.
