# Web enterprise module
## 現行 surface 與 invariant
URLs：`/enterprises`、`/enterprises/{slug}`、`/enterprises/{slug}/teams/{teamSlug}`；API `/api/enterprise`。

FPT `schema-enterprise-admin` 對照 Enterprise/EnterpriseTeam 治理；`slug` 定位而 stable ID 用於命令。EnterpriseTeam 的 membership/Organization assignment 不得因名稱含 Team 而交給 `@line_bot_v1/team`。

改 slug/rename 流程需同步 canonical link、直接開啟、刷新與 current scope recheck；不新增平行 Enterprise identity。

- Owns Enterprise presentation and command transport; Enterprise lifecycle, relation, team and assignment invariants belong to `@line_bot_v1/enterprise`.
- Enterprise scope is explicit; selected organization, URL and UI role do not authorize cross-organization mutation.
- Preserve invitation, attachment, assignment, version/replay and forbidden/unavailable result semantics.
