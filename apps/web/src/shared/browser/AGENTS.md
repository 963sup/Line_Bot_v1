# Browser shared boundary


## 現行機制與 invariant

URL consumers：LIFF entry、login continuation 與 Google session handoff；正式 route owner 見 [app](../../app/AGENTS.md)。SDK readiness、token refresh/clear、visibility 與遲到 response 是機制，不決定 Account/Repository 權限。

改 URL whitelist 需驗 direct open、LIFF state、取消登入與換帳號；callback/session token 不放 URL、telemetry 或跨 scope cache。FPT identity/locator 對照不取代 provider 驗證。

- Browser code is presentation/runtime support and must remain free of server credentials, private database access and business authority.
- LIFF/session/navigation state is untrusted intent; server routes re-establish Principal, scope, permission, version and replay authority.
- Preserve abort/mounted guards, stale-response rejection, safe URL handling and browser/server dependency separation.
