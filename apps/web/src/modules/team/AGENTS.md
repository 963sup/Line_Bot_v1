# Web team module
## 現行 surface 與 invariant
URLs：`/team`（Organization Team 工作台）、`/organizations/{login}/teams/{teamSlug}`（canonical detail）；API `/api/team`。

FPT `schema-teams` 對照 Organization-owned Team；EnterpriseTeam 由 enterprise module 擁有。Team slug 隨 rename 改變、stable TeamId 保留；`/team` 不是單一 Team identity，也不是 Partners 的 parent owner。

改路徑或 scope selector 必須同時驗 Organization qualification、TeamMembership、maintainer invariant、wrong-scope 與 rename 後 URL；不從 Team membership 自動授予 Repository 或全站管理權。

- Owns Team presentation and transport; Team scope, membership and maintainer authority belong to `@line_bot_v1/team` and Identity/Access.
- Membership is not permission; selected Team ID and UI role are requested targets, not authority.
- Do not imply Enterprise Team hierarchy or nested Organization Teams until the owner contract and runtime capability exist.
