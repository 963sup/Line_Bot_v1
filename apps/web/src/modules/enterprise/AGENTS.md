# Web enterprise module

## GitHub Mobile 目標（後續實作）

- FPT enterprise-admin 對照「Enterprise 列表 → Enterprise header/治理詳情 → EnterpriseTeam/Organization 關係 → 明確管理操作」。header 持續顯示目前 Enterprise，避免切 scope 後失去脈絡。
- 關係用分區列表、角色 badge 與明確來源表示；不把 EnterpriseTeam 與 Organization Team 排成沒有契約支持的任意樹。
- slug 改名後連結與返回更新到 canonical URL；畫面名稱變動不改 stable command ID 或 replay。

## 現行 surface 與 invariant

Current URL：`/enterprises`、`/enterprises/{slug}`、`/enterprises/{slug}/teams/{teamSlug}`；API `/api/enterprise`。

FPT `schema-enterprise-admin` 對照 Enterprise/EnterpriseTeam 治理；`slug` 定位而 stable ID 用於命令。EnterpriseTeam 的 membership/Organization assignment 不得因名稱含 Team 而交給 `@line-work/team`。

改 slug/rename 流程需同步 canonical link、直接開啟、刷新與 current scope recheck；不新增平行 Enterprise identity。

- Owns Enterprise presentation and command transport; Enterprise lifecycle, relation, team and assignment invariants belong to `@line-work/enterprise`.
- Enterprise scope is explicit; selected organization, URL and UI role do not authorize cross-organization mutation.
- Preserve invitation, attachment, assignment, version/replay and forbidden/unavailable result semantics.
