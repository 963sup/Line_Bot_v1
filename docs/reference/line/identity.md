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

Browser只取得proof並送server；authorization不在client完成。Token不放product URL/local durable store/business record。Token過期、Channel不符、subject無mapping、account不qualified或mapping conflict皆fail closed，不回退profile/email/cache。
