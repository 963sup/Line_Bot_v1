# Browser shared boundary

## GitHub Mobile 目標（後續實作）

- 目標支援 Mobile 式 tab/返回位置連續性，但只能保存同一可信 viewer 下的非敏感導航 intent；tab 切換不重建 provider session，不為每頁重複載入 LIFF。
- 帳號切換、登出、scope/revoke、visibility 恢復先按現行契約清除或重驗私人投影；遲到 response 不得恢復舊身分畫面。列表位置保留不等於業務資料永久快取。
- Deep link、外部瀏覽器、Android back 與 iOS 手勢返回都需實測或明列未驗證；不可假設 Next navigation 等同原生 app。

## 現行機制與 invariant

URL consumers：LIFF entry、login continuation 與 Google session handoff；正式 route owner 見 [app](../../app/AGENTS.md)。SDK readiness、token refresh/clear、visibility 與遲到 response 是機制，不決定 Account/Repository 權限。

改 URL whitelist 需驗 direct open、LIFF state、取消登入與換帳號；callback/session token 不放 URL、telemetry 或跨 scope cache。FPT identity/locator 對照不取代 provider 驗證。

- Browser code is presentation/runtime support and must remain free of server credentials, private database access and business authority.
- LIFF/session/navigation state is untrusted intent; server routes re-establish Principal, scope, permission, version and replay authority.
- Preserve abort/mounted guards, stale-response rejection, safe URL handling and browser/server dependency separation.
