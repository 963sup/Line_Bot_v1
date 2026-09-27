# Web repository module

## GitHub Mobile 目標（後續實作）

- FPT repos/issues/discussions 對應「owner/name header → scope 內資源導覽 → 列表 → 詳情／操作」。Repository、Issue、Discussion、Label、Milestone 保留各自名稱與 identity，不收斂成無種類的通用卡片。
- Repository row 顯示 owner/name 與可取得的 metadata；Issue row 顯示 title、number、state；Discussion row 顯示 title/category/author 等已有欄位；Label 用 name/color；Milestone 用 number/title/status。缺資料不創造 count、進度或活動時間。
- Issue 詳情可依現有 command 顯示可執行操作與 durable evidence；Discussion body/comments、Label 與 Milestone 目前 read-only，不加假編輯/新增留言按鈕。
- 資源導覽放 header 下，以緊湊連結、可換行或可及的水平捲動維持層級；320px 不擠窄 title。只放已有資源，不複製 Code/Pull Requests/Actions/Projects 空分頁。
- Inbox/Explore/Home 入口與 public/private Repository 根頁使用同一 canonical resource URL；safe navigation context 可以不同，授權與資料 owner 不能不同。

## 現行 surface 與 invariant

Current URL：`/repositories`、`/search`、`/explore`、`/{login}/{repository}` 與其 `issues`、`discussions`、`labels`、`milestones` 子資源；完整 list/detail locator 見 [resource group](../../app/%28resource%29/AGENTS.md)，HTTP selector 見 [API](../../app/api/AGENTS.md)。

FPT repos/issues/discussions 的分片在本產品共同由 Repository owner 承接。Issue.number、Milestone.number 是 Repository-local；Discussion 使用 opaque id；Label 目前只有 collection。不能為了模仿 GitHub URL 新增 Discussion number 或 Label detail identity。

目前 `/repositories` 是 current viewer 的 authorized Repository collection；IssueBoard 只在 canonical Repository Issues surface 使用，不再把 Repository collection 等同 Issue collection。Discussion/Comment、Label、Milestone 為 authorized read；write management 與 Project 不因頁面存在而完成。Repository root、IssueBoard 與 resources-panel 的 sibling navigation 應維持一致 contract，修改時同時覆蓋 public/private 根頁與直接開啟的子頁。

只在存在不同 lifecycle/consumer 需要時細分檔案；不建立 generic resource CRUD 抹去各資源語意。

- Owns Repository/Issue presentation and HTTP projection; Repository identity/access and Issue lifecycle remain in `@line-work/repository`.
- Do not use Task or Team as aliases for Repository/Issue. Team membership is not Repository access authority.
- Preserve request replay, expected-version conflict, current access recheck and unknown-result retry semantics.
- Project planning references Issues through Project contracts; this module never turns Project metadata into Issue truth.

- `/search` reuses the authorized Repository collection as a presentation filter; it does not create a generic Search owner or a second Repository truth.

- Home create intent must select a Repository with `write | admin` before entering canonical Issues with `create=1`. The query controls presentation only; the Issue command still revalidates Repository access and replay in the Repository owner.
