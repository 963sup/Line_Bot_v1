# App route scope

`apps/web/src/app` 擁有 Next.js route ownership、layout、HTTP delivery 與最外層 composition。Business truth、authorization、resource lifecycle 與 persistence 仍由 owning package/application contract 決定。

## Route invariants

- 一個正式 URL 只有一個 route owner；Route Group 只表達 layout/runtime responsibility，不進 URL、也不授權。
- Page / Route Handler 只做 transport、presentation 與 composition；不得複製 Domain/Application rule 或直接建立第二個 writer。
- Stable ID、login、slug、number 與 query parameter只定位／表達 intent；不能自稱 actor、scope、role、permission 或 current version。
- Direct open、refresh、soft navigation、back 與登入接續必須回到同一 authoritative query/command semantics。
- 任意 `returnUrl`、credential、private draft、authorization decision 或 mutable server state 不進產品 URL。
- `app/api/_composition` 只在最外層接 concrete adapters；module/shared 不反向依賴 app composition。

Current route inventory、Mobile app-shell 與 URL contract 由 [Web runtime](../../../../docs/reference/runtime/routes.md) 與實際 route tree共同證明；本檔不再手抄第二份 route/feature清單。

## Scope routing

| Scope | Responsibility |
| --- | --- |
| [(public)](<(public)/AGENTS.md>) | Public entry 與 public locator delivery |
| [(resource)](<(resource)/AGENTS.md>) | Canonical resource URL / projection |
| [(mobile)](<(mobile)/AGENTS.md>) | Authenticated Mobile / LINE MINI App delivery |
| [(rich-menu)](<(rich-menu)/AGENTS.md>) | Rich Menu entry composition |
| [(onboarding)](<(onboarding)/AGENTS.md>) | Registration / restore / completion |
| [(admin)](<(admin)/AGENTS.md>) | Admin delivery |
| [(system)](<(system)/AGENTS.md>) | Callback / continuation / unavailable results |
| [api](api/AGENTS.md) | HTTP methods、input/scope translation、owner wiring |

FPT / Mobile benchmark usage 繼承 [apps scope](../../../AGENTS.md)。Locator 語意以本地 semantic owner 為準，不從 GitHub URL 形狀推導。

## Change rules

- 修改 URL 前沿 `page/route → module → _composition → package public export` 查實際 consumer，同時檢查 direct open、refresh、back、login/LIFF continuation 與舊入口。
- 新增 framework special file、parallel/intercepting route 或 slot 必須有真實 navigation/runtime responsibility；不為形式完整預建。
- Protected request 每次重新驗可信 identity / qualification / scope；layout、page visibility、query 或 prior success 都不能替代 authorization。
- External callback/webhook 按 provider trust contract 驗證；credential 不複製到產品 URL。
- 未實作能力留在 Governance / semantic status，不建立空 page/API 宣稱完成。

相關 current contract：[Web runtime](../../../../docs/reference/runtime/routes.md)；repository placement：[Dependency boundaries](../../../../docs/rules/dependency-boundaries.md)。
