# LINE identity reference

## Verification boundary

Server收到LINE proof後驗證Channel/Provider、token validity與可信subject，再透過persisted identity mapping解析internal human identity。Webhook signature 只證明 LINE Platform request proof；它不授予 business permission。

Current human identity semantics 已由 Account/User 擁有：LINE provider subject 經 server-side verification 後解析 current `UserId`；historical `Member` / `member_id` literal 只在既有 protocol/storage boundary 保留，不形成第二套 identity authority。Employment-scoped qualification 的未完成 cutover 另見 Governance；本文件不以 legacy naming 表示 Account migration 尚未完成。

以下不能直接當identity authority：browser提供的memberId/accountId、LIFF profile、client decoded ID token/userId、display name/email、LINE groupId、editable metadata。

Verified provider+subject只證明external identity；private read/write仍需解析current User/Member qualification、trusted Principal與scope/capability。

Webhook 中 `source.userId` 代表發出命令的人類 subject，應解析實際 User；人類 intent 缺少 `source.userId` 或無法驗證 mapping 時必須拒絕，不得以 `destination` 冒充 actor。非人類 provider events 仍由對應 protocol flow 擁有，不虛構 human actor。`destination` 只表示 receiving LINE Official Account bot 的 provider context；Bot 回覆 command 結果是 delivery，不會改變 actor、authority 或 audit owner。

## Mapping

Target：

```text
LINE provider + subject
        ↓ verified mapping
UserId
```

LINE subject不直接成為EnterpriseAccountId、OrganizationAccountId、EmploymentId、PrincipalId或business FK。解除/重新連結external identity不轉移historical business ownership。

LINE bot userId／`destination` 只作 Integration 維護的 provider context；它不建立 Account identity、Principal 或 Permission。若未來 autonomous Bot 需要產品 identity，必須由該真實 use case 重新定義 owner 與 lifecycle。

## Browser / failure

Browser只取得proof並送server；authorization不在client完成。產品首次登入或使用者明確重新登入時，以 `POST /api/auth` 傳送短期 LINE access token。伺服器驗證 token 的 channel、有效期與 `profile` scope，再向 LINE 取得 subject；只有此伺服器驗證出的 subject 可用來解析 Account mapping。前端不得傳 userId、profile 或 decoded token claims 作登入依據。一般頁面載入先以 `GET /api/auth` 從有效 HttpOnly cookie 恢復產品 session；cookie 無效時才要求 LIFF proof。

驗證成功後，Web 以隨機 opaque ID 發出 HttpOnly、Secure、SameSite=Lax cookie；Redis 保存 subject 與 session generation，session 有效期為七天，可由 `DELETE /api/auth` 撤銷。`GET /api/auth` 只在有效 cookie 存在時回傳非秘密 generation，讓重新載入的頁面恢復現有產品 session；瀏覽器接著以 `PATCH /api/auth` 續期，不需重新呼叫 LINE。相同有效 subject 重新驗證會沿用 session generation；明確以新 LINE proof 登入並建立新 generation 時回傳 `sessionChanged`，其他分頁會撤銷舊頁面記憶並要求重新登入，避免共用 cookie 換帳號後沿用舊畫面。後續受保護 API 只讀取產品 cookie 與非秘密 generation 一致性標記，不重複呼叫 LINE。Cookie 不授予 User qualification、Repository scope 或 business permission；各 owner 每次仍須重新解析狀態與授權。

LINE token 僅在建立／重新驗證產品 session 時經 HTTPS 傳送；不放入 URL、local/session storage、一般 API header、business record、log 或 analytics。LINE token 不作長期產品 session。登出只撤銷本服務 session，不呼叫 LINE logout，也不登出 LINE 帳號。Token 過期、Channel 不符、subject 無 mapping、account 不 qualified 或 mapping conflict 皆 fail closed，不回退 profile/email/cache。
