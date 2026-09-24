# 帳號關聯與 token 生命週期

來源核對：2026-09-07。先區分現有 LIFF 身分綁定、LINE Login OAuth 與 Messaging API 原生 account linking，不能因新技能另建一條平行註冊流程。

## 原生 account linking

[官方流程](https://developers.line.biz/en/docs/messaging-api/linking-accounts/) 適用於 bot 好友與既有服務帳號關聯，無需另有 LINE Login channel。

1. 以可信 LINE userId 簽發 link token，導向服務自己的登入流程；link token 為一次性且目前有效 10 分鐘。
2. 使用者完成服務端登入後產生不可猜、一次性的 nonce，保存 nonce 與服務帳號的對應及期限；不能以 userId 作 nonce。
3. 按官方 account-link URL 帶 linkToken 與 nonce 返回 LINE。這是協定要求的一次性連結資料，不是把 user access token、ID token 或 channel secret 放 URL；避免記錄完整連結。
4. 只有已驗簽的 accountLink event、`result: ok`、有效 nonce 與帳號映射都成立才提交關聯。失敗事件不得綁定；已用／過期 link token 可能根本沒有 Webhook，UI 應能安全重新開始。
5. 原子消耗 nonce 並維持唯一映射，處理重放與綁定衝突；保留使用者解除關聯的能力與說明。瀏覽器 redirect 成功不等於服務端綁定已完成。

回歸情境：攻擊者連結、錯 nonce、相同事件重送、過期無回呼、使用者取消、既有關聯衝突及解除後重新綁定。產品 member／owner／suspended 契約仍需獨立核驗。

## OAuth 與 LIFF 的生命週期

依 [Managing access tokens](https://developers.line.biz/en/docs/line-login/managing-access-tokens/) 與 [Login reference](https://developers.line.biz/en/reference/line-login/) 讀實際 expires_in、refresh 回應與撤銷行為；OAuth access／refresh token 的期限不能套用到 LIFF SDK token。

只有需要伺服器持續代用戶存取且流程有發 refresh token 時才管理 refresh。更新時保存實際新回應，不假設舊 refresh token 永遠可用；過期或撤銷就回到登入。不要假定 liff.getAccessToken() 也給你可自行更新的 refresh token。

新頁或重新授權後取當前 LIFF token；不要把先前關閉視窗或新增 scope 前的 token 當長期憑證。登出、撤銷授權、解除 LINE 帳號關聯與刪除產品帳號是不同操作，依使用者要求決定範圍。
