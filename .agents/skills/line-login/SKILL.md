---
name: line-login
description: 開發、診斷或審查 LINE Login OAuth／OIDC、PKCE、token 核驗及 LINE 身分關聯；日常 LINE 會員授權與選填 Google 關聯分開處理。
---

# LINE Login

先讀 [Account](../../../docs/010-domain-owners/010-account.md) 與 [Supabase platform contract](../../../docs/030-platform/020-supabase.md)，分清 LINE 身分證明、產品 session 及會員資格，避免另建平行登入系統。

## 選擇路徑與文件

- LIFF 傳 token：核驗原始 token；不為排錯新增完整 OAuth redirect flow。
- 明確需要 LINE Login OAuth：定位 authorize、callback、token exchange 與 server session。
- Google 登入或產品 session：依 Supabase 主文件及適用 skill 處理，LINE Login 不接管 Google provider。
- 原生 Messaging API account linking、解除關聯、refresh 或 token 生命週期：讀 [帳號關聯與憑證](references/account-linking.md)。

Context7 可用時先 resolve `LINE Developers`，選官方文件庫後 query 單一認證概念；同一任務重用已解析且仍適用的 ID，來源或版本改變時才重新解析。不傳真實 token 或私有資料；缺漏、不可用或來源矛盾時讀下列官方原頁，不照抄範例。

## 核驗流程

1. 確認 Provider、預期 channel ID、callback 與 scope，不輸出 channel secret。核對 Bot 與 MINI App Provider 關係；不要假設不同 Provider 的 userId 相同。
2. OAuth 使用不可預測、短效且與發起 session 綁定的一次性 state，callback 先比對再交換 code。採 PKCE S256，保存 verifier 至交換完成；使用 nonce 時核對原值。限制 redirect 目的地，處理取消、錯誤與重放。
3. ID token 透過官方驗證 endpoint 或正確 JWT 驗證器驗證簽章、issuer、audience、有效期及流程要求的 nonce。預期 channel 由伺服器設定，不能由請求自行指定。
4. Access token 與 ID token 不混用：使用 access token 時先核對 channel／有效性，再依官方 API 取得身分。解碼 JWT 或取得 profile 不等於完成驗證。
5. LINE 註冊與日常業務依會員主契約驗 LINE 身分及會員資格，不要求 Google session。僅選填 Google 關聯需要 Supabase session 與當前 LINE 雙證明。保存穩定 member_id 的唯一映射，不以 email 合併、不藉重新登入繞過 suspended；長期關聯不依靠 token 永不過期。
6. Access／ID token 與 secret 不進業務 URL、log、Git 或無需求的長期儲存；channel secret 僅後端使用。OAuth code／state 或原生 account linking 的一次性 linkToken／nonce 按協定處理，不能將其擴張為容許長期憑證進 URL。內外瀏覽器接續及 cookie 規則依主文件，不假定共用 session。

依改動驗證錯 channel、過期／偽造 token、state／nonce 不符、callback 重放、綁定衝突、停權與取消流程。使用 repository 驗證入口；手機跨瀏覽器往返另需實測證據。

## 官方入口

- [Web Login 整合](https://developers.line.biz/en/docs/line-login/integrate-line-login/)：授權碼、state 與 callback。
- [PKCE](https://developers.line.biz/en/docs/line-login/integrate-pkce/)：challenge 與 verifier。
- [LINE Login API](https://developers.line.biz/en/reference/line-login/)：token 交換、驗證與撤銷。
- [LIFF 身分傳遞](https://developers.line.biz/en/docs/liff/using-user-profile/)：前後端驗證分工。
