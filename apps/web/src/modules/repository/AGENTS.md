# Web repository module
## 現行 surface 與 invariant
URLs：`/repositories`、`/repositories/lists`、`/repositories/lists/{listId}`、`/repositories/lists/discover`、`/search`、`/explore`、`/{login}/{repository}` 與其 `access`、`settings`、`issues`、`discussions`、`labels`、`milestones` 子資源；完整 locator 見 semantic model，HTTP selector 見 [API](../../app/api/AGENTS.md)。

FPT repos/issues/discussions 的分片在本產品共同由 Repository owner 承接。Issue.number、Milestone.number 與 Discussion.number 都是 Repository-local canonical semantics；現行 Discussion detail route 仍使用 opaque id，這只是目前 implementation locator，不得覆蓋 FPT authority。Label 目前只有 collection；若調整 locator，必須從 semantic truth 同步到 schema、domain 與 route，而不是只改 URL。

目前 `/repositories` 是 current viewer 的 authorized Repository collection；IssueBoard 只在 canonical Repository Issues surface 使用，不再把 Repository collection 等同 Issue collection。Discussion/Comment、Label、Milestone 為 authorized read；write management 與 Project 不因頁面存在而完成。Repository root、IssueBoard 與 resources-panel 的 sibling navigation 應維持一致 contract，修改時同時覆蓋 public/private 根頁與直接開啟的子頁。

只在存在不同 lifecycle/consumer 需要時細分檔案；不建立 generic resource CRUD 抹去各資源語意。

- Owns Repository/Issue presentation and HTTP projection; Repository identity/access and Issue lifecycle remain in `@line_bot_v1/repository`.
- Do not use Task or Team as aliases for Repository/Issue. Team membership is not Repository access authority.
- Preserve request replay, expected-version conflict, current access recheck and unknown-result retry semantics.
- `/{login}/{repository}/access` manages Repository-owned Direct User / Organization Team grants only. It must not create, remove or reinterpret OrganizationMembership / TeamMembership; browser pending state only preserves exact-retry request identity.
- `/{login}/{repository}/settings` reads the Repository address for current effective members and lets a current effective Repository admin set or remove it. The browser binds pending retries to the verified User and rechecks identity and admin authority before sending.
- Project planning references Issues through Project contracts; this module never turns Project metadata into Issue truth.

- `/search` reuses the authorized Repository collection as a presentation filter; it does not create a generic Search owner or a second Repository truth.
- `/explore` consumes the Repository discovery contract. Trending uses the owner-defined 7-day active-Star window with total Star/name/id tie-breaks；Activity 只投影 current-access-safe immutable Issue events；Awesome Lists links to the public Repository Star List discovery projection. My Lists management persists exact-retry pending command metadata in browser storage but server remains replay/version/authorization authority.

- Home create intent supports Repository creation at `/repositories/new` plus Issue creation. Repository create owner options come from the owner contract, use stable Account IDs, persist an exact-retry requestId in browser storage for unknown outcomes, and redirect only after a committed create result. Issue create仍 must select a Repository with `write | admin` before entering canonical Issues with `create=1`.
