# Web organization module

## GitHub Mobile 目標（後續實作）

- FPT orgs 對應 Organization header 與成員/邀請/Team 關係分區；public profile 只展示公開 projection，治理工作面保留目前 scope 與角色資訊。
- Direct membership 與 EnterpriseTeam-derived membership 在 row/詳情標出來源與允許操作，不能把所有成員都做成同一個 Remove 按鈕。
- Current 工作面詳情不是獨立 deep link；目標布局可先在同一路由分層，若需要新治理 URL 必須另定 canonical/return/access 契約，不在本次文件中宣稱完成。

## 現行 surface 與 invariant

Current URL：`/organizations`（工作面）、`/{login}`（public Organization projection）；API `/api/organization`。

FPT `schema-orgs` 對照 Organization 與 membership；`/organizations/{login}/teams/{teamSlug}` 的 Team page 由 team module 承接。本模組目前詳情選取在工作面狀態中，不宣稱有 `/organizations/{login}` 私有詳情 URL。

新增可分享的治理 URL 必須先定義其與 public locator 的關係、current access 與 reload 行為；不以新增同名 page 取代 owner 決策。

- Owns Organization presentation and transport; membership sources, effective membership, invitations and Team scope belong to their owners.
- Explicit Organization ID is a requested scope only; server rechecks participation, role assignment, version and replay at mutation.
- Direct membership and Enterprise Team-derived membership must remain distinguishable in UI and projections.
