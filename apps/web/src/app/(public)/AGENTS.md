# Public route group

## GitHub Mobile 目標（後續實作）

- `/{login}` 是 canonical User/Organization profile composition：先由 directory 分辨 owner，再呈現 owner identity 與各 owner 明確允許的 public projection。Repository 公開列表由 Repository public contract 提供；不得在 page 直接查表或複製 Repository truth。
- 公開入口與法律頁採簡潔 header＋單欄內容；登入是明確 CTA。Canonical `/{login}` Profile 在 trusted current membership login 與 route login 相同時，可投影 authenticated app shell／Home-active Bottom Navigation；匿名或其他 viewer 不顯示私人工作 tab。Shell 只提供 presentation/navigation，不建立 authorization。
- Public Profile 的 viewer probe 只能讀取已存在的 LINE session；不得因為 render `/{login}` 而主動觸發 LINE login。只有明確登入／受保護操作可以要求 provider login。
- Mobile 的 Profile tab 對應 authenticated viewer hub，不取代本層 canonical profile URL。

## 現行 URL 與 invariant

Current URL：`/`、`/login`、`/privacy`、`/terms`、`/{login}`。

- FPT `schema-users` / `schema-orgs` / RepositoryOwner 對照：`/{login}` 由 login directory 判定 User 或 Organization；不增加 `/users/{login}` 與 `/organizations/{login}` 作第二個 public identity。
- 公開 profile、Organization 與 Repository owner projection 只讀各 owner 的 public contract；Repository 根頁由相鄰 `(resource)` 擁有，不在本層重做。Repository-owned public star count 可支撐 owner Profile 的 Popular ranking；Follow、Starred、Project、Organizations relationship 未有 public contract 前不得成為 public Profile facts。當 trusted current membership login 與 route login 相同，viewer-only composition 可重用既有 authenticated Organization / Repository Star read contracts呈現自己的導覽與 count；這些 self-only projection 不得洩漏給匿名或其他 viewer，也不得被提升成 public contract。Projects 在 real runtime contract 出現前只可呈現明確的未開放狀態；Status、Achievements 等沒有 owner/truth 的能力不得為了模仿 GitHub 造資料。Canonical User Profile可承接 viewer自己的 secondary Settings入口與 app shell navigation，但只在 trusted membership login與 route login一致時顯示；Organization或其他 User Profile不取得 viewer controls。
- 登入入口只是意圖；不得把公開 profile visibility 解讀為其 Repository、成員或治理資料都公開。

- Public pages may explain, enter or authenticate; they do not expose private business data or authorize mutations.
- External entry and return URLs are allowlisted intent only; they cannot carry credentials, roles, scopes or mutable server authority.
- Keep unauthenticated, unavailable and invalid-entry states distinct and avoid leaking private existence through error mapping.
