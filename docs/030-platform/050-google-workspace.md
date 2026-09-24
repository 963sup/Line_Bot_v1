# Google Workspace

## Current adapter scope

`@line-work/google-workspace` 提供 server-side Calendar、Tasks、Forms、Drive、Keep、Gmail、Docs、Sheets、Maps geocoding adapters。Adapter存在只表示 provider capability source；OAuth lifecycle、product use case、real-account/mobile acceptance 仍需各 flow 證據。

## Relationship separation

1. Google/Supabase identity link：external identity mapping。
2. Workspace OAuth connection：特定 Google account + token + scopes。
3. Team/Project external-resource binding：本地 business resource 對指定 Google resource 的 relation。

三者不能互推。Google login 不等於 Workspace API authorization；個人 connection 不自動給 Team 其他 participant 使用。

## First write-flow rule

第一條 Workspace write 必須從已有 stable ID/owner/version 的 local source 開始，向 current User 顯示 target Google account/resource 與內容，明確確認後執行。候選 Local Task → own Google Tasks 仍只是 target，adapter存在不代表已開放。

不預建 arbitrary Drive/mailbox browser、bidirectional sync、background scheduler、permanent refresh-token sync 或 generic Google action framework。

## OAuth lifecycle

啟用 flow 時 server 重驗 current User、source、scope/target intent；external browser 不接受 URL account/member ID 作 identity。Callback 驗 state/code/redirect/expiry/one-time use/Google subject/granted scopes。Access token 只在受限 server storage、TTL 不超 token/operation window；Supabase provider token 不挪作 Workspace API token。

Cancel/expiry/unlink 清 credential；remote revoke failure 明示 unknown/not-confirmed。Refresh token/background sync/cross-instance credential store 只有真實 requirement/security design 後加入。

## Write and recovery

External API 不放長 DB lock。Operation 至少 `pending confirmation -> executing -> success | failure | unknown result`，stable operation ID 有 durable claim/result。External success + local timeout/save failure 先 reconcile，不盲重送；Gmail send尤其如此。

Forms 若只是 external entry且沒有 trustworthy response→User mapping，不宣稱系統收到提交。Maps geocoding 是地址解析，不是 Attendance GPS/geofence proof。

## Current adapter guarantees

List pagination有界；頁面失敗不回 partial 冒充完整；operation有 timeout/cancellation；adapter不保存 token、不自動 retry side-effect write；caller仍需 owner/scope/resource validation。

Open OAuth/source/recovery/real-account requirements 見 [Google Workspace gaps](../090-governance/040-gaps/050-google-workspace.md)。
