# Resource route group

`/{login}/{repository}/wiki` lists authorized Wiki pages; `/wiki/{pageId}` uses stable page identity across rename and revision restore. Historical content rechecks current source access; Markdown stays escaped raw text. URLs never grant access.

`/{login}/{repository}/insights` is the authenticated read-only Repository Pulse entry. The locator is resolved under current Repository access; no public metrics are server-rendered.

`/{login}/{repository}/objects` and `/objects/{objectId}` present the Repository-scoped
Resource owner contract. Resource Type, immutable Resource revision and directed Resource-to-Resource
relationship facts remain owned by `@line_bot_v1/resources`; the URL locator never authorizes.

`/{login}/{repository}/wbs` retains existing Repository-WBS content, exact retries and controlled migration. New WBS starts in Project. Overview conditionally links to legacy recovery from WBS-owned eligibility; shared navigation has no WBS tab. After cutover, current source-owner authorization resolves the Project destination without requiring the retired content API to succeed.


## 現行 URL 與 invariant

Current URL：`/{login}/{repository}`；FPT 對照 `schema-repos` 與 RepositoryOwner。

- Repository root presents Overview and content entries. Public metadata remains anonymous-readable; current authenticated Repository scope supplies private/internal metadata and admin controls. IssueBoard is confined to Issues routes. Public lookup failure remains unavailable and retryable, not a missing Repository.
- `access`、`settings`、`issues`、`discussions`、`labels`、`milestones` 子路徑與 Repository root 已收斂在本 group；同一 canonical locator hierarchy 只有一個 route owner。
- 改根頁導覽必須同時核對 public/private branch 的目的地、手機換行、對比及返回；只測登入後子頁不足以證明公開根頁。
- URL owner/name 與 stable RepositoryId 分開；變更名稱或 scope 必須重新解析，不以瀏覽器保存的舊 ID 取代路徑意圖。

- `/{login}/{repository}/access` is an authenticated Repository management projection; owner/name still only locates, and every mutation re-checks current Repository admin, including OrganizationOwner implicit admin.
- Canonical resource URLs are identity locators, not authorization.
- A Repository URL may resolve a public projection or, after trusted LINE identity, an authorized private/internal projection without exposing private existence to anonymous callers.
- Keep one formal URL owner; `/repositories` collection/workbench remains a `(mobile)` surface，canonical Repository identity/subresources remain here.
