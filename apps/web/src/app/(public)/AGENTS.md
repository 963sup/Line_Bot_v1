# Public route group

## GitHub Mobile 目標（後續實作）

- `/{login}` 以頭像/名稱/login、公開描述、已授權公開關係的順序呈現 profile；先由 directory 分辨 User/Organization，再選投影，不顯示無來源的貢獻格、成員數或私人資源。
- 公開入口與法律頁採簡潔 header＋單欄內容；登入是明確 CTA，不因瀏覽公開頁自動觸發註冊或顯示私人工作 tab。
- Mobile 的 Profile tab 對應 authenticated viewer hub，不取代本層 canonical profile URL。

## 現行 URL 與 invariant

Current URL：`/`、`/login`、`/privacy`、`/terms`、`/{login}`。

- FPT `schema-users` / `schema-orgs` / RepositoryOwner 對照：`/{login}` 由 login directory 判定 User 或 Organization；不增加 `/users/{login}` 與 `/organizations/{login}` 作第二個 public identity。
- 公開 profile 與 Organization projection 只讀各 owner 的 public contract；Repository 根頁由相鄰 `(resource)` 擁有，不在本層重做。
- 登入入口只是意圖；不得把公開 profile visibility 解讀為其 Repository、成員或治理資料都公開。

- Public pages may explain, enter or authenticate; they do not expose private business data or authorize mutations.
- External entry and return URLs are allowlisted intent only; they cannot carry credentials, roles, scopes or mutable server authority.
- Keep unauthenticated, unavailable and invalid-entry states distinct and avoid leaking private existence through error mapping.
