# Provider、channel 與憑證

來源核對：2026-09-07。設定變更前先讀回目前值，避免用重新建立 channel 掩蓋錯配。

## 控制面與身分

依 [Console 管理最佳實務](https://developers.line.biz/en/docs/line-developers-console/best-practices-for-provider-and-channel-management/) 確認服務提供者擁有 Provider；外包開發者的組織不應因代開發就成為服務擁有者。同 Provider 的同一使用者在不同 channel 具有相同 userId；不同 Provider 不可直接當同一人。Channel 建立後不能移至另一 Provider。

Provider 與 channel 角色獨立，擁有 Provider Admin 不表示每個 channel 都有 Admin。排查看不到 channel 時先查登入帳號、角色、邀請接受狀態；不要立即新建或刪除。團隊管理可依官方建議避免唯一管理者失聯，但不因技能自動新增人員或放大權限。

建立／修改前記錄：服務區域、Provider、channel 類型與 ID、官方帳號、LIFF ID、endpoint、callback、scope、環境及已授權操作。只有相關項目需要填；不建立無用途的永久盤點系統。

## 不同憑證不能互換

| 憑證 | 用途與主要誤用 |
| --- | --- |
| Channel secret | 驗 Webhook 或產品規定的憑證簽發；不能當使用者身分。 |
| Channel access token | 以指定 channel 呼叫服務端 API；不是 Login access token。 |
| LINE Login／LIFF user access token | 取得該使用者被授權的資料；後端仍需核對 channel 與有效性。 |
| ID token | 驗證 issuer、audience、期限等後取得身分；僅 decode 不可信。 |
| Reply token | 對應可回覆事件的一次性回覆；不作會員或長期通知憑證。 |
| Account link token／nonce | 帳號綁定協定的一次性資料；不作通用登入 session。 |
| Service notification token | MINI App 特定操作的後續服務訊息；不作任意推播 token。 |

依 [Channel access token](https://developers.line.biz/en/docs/basics/channel-access-token/) 選產品支援的類型：

- Stateless 短效且不能撤銷；不能承諾失竊後可透過 revoke 立即失效。
- Short-lived 有簽發數上限；超量可能撤銷最舊 token，避免每個 request 都簽發。
- v2.1 可指定期限，需管理簽發與金鑰；沒有實際需求不強迫既有系統遷移。
- Long-lived 限 Messaging API；重新簽發可能使既有服務失效，輪替先安排部署及舊 token 過渡。

期限、上限及支援清單以當次文件和回應為準。MINI App 依 [Console guide](https://developers.line.biz/en/docs/line-mini-app/discover/console-guide/) 使用對應內部 channel 憑證，不能拿 Bot 長效 token 或 Developing token 呼叫 Published 功能。

## 執行核對

先檢查設定存在及匹配，僅輸出非秘密識別值；不整份列印 env。憑證問題驗證錯 channel、過期、撤銷、輪替與重啟後讀取。長期會員關聯保存穩定識別映射，不保存一個永不失效 token 來代替授權。
