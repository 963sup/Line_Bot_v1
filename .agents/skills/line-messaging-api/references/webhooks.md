# Webhook 接收與診斷

核對日期：2026-09-07。以實際 channel、endpoint、事件與時間界定問題；以下是官方行為與診斷方法，不代表專案已實作所有事件。

## 接收與驗簽

- [Verify webhook URL](https://developers.line.biz/en/docs/messaging-api/verify-webhook-url/)：Console Verify 或 webhook test endpoint 會送 `events: []` 的 POST。驗簽通過後回 200，不觸發業務；URL 可通不代表會員、收圖或回覆可用。
- [Signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)：以 channel secret 對未改動的 UTF-8 body 做 HMAC-SHA256／Base64，再比較 `x-line-signature`。不能先 JSON parse／重序列化、正規化換行或解 escape；proxy 也不能改 body。缺簽章／不符即拒絕。LINE 未公開 Webhook 來源 IP，不以猜測 IP 白名單取代驗簽。
- 排查驗簽先比對 channel 與 secret 是否輪替、framework 是否先消耗或改寫 body、proxy 與字元編碼。無需在日誌保存秘密或整段私人聊天，也不以重新發 secret 作為無證據的試錯。

## 事件生命週期

依 [Receive messages](https://developers.line.biz/en/docs/messaging-api/receiving-messages/) 與 [API reference](https://developers.line.biz/en/reference/messaging-api/) 選本次所需事件，不預建全部 handler。

- 一個 request 可包含多個事件；以事件 ID 防重，重送不保證順序或必達。Webhook redelivery 預設關閉，重送次數與間隔未公開；不要憑空指定固定排程。重送保留 webhookEventId 與 replyToken，不能當成新回覆額度。
- 官方建議非同步處理以避免互相等待；實作時查部署環境是否保障回應後任務存活。需要可靠處理時先依既有契約持久接收，不能裸啟 Promise 後回 200 就宣稱可靠，也不因此無條件新增 queue。
- 文字在事件中；媒體依 messageId 取得，不可假定可事後下載文字或引用訊息原文。媒體有保存期限且期限未公開。只在業務授權範圍內下載，必要時查 transcoding 狀態。
- `liff.sendMessages()` 送出的 Flex／template 不產生 Webhook；勿將「沒收到事件」直接判定為 URL 故障。`quotedMessageId` 不提供歷史訊息內容讀取能力。
- Unsend 代表使用者收回意圖，官方建議避免後續展示或利用。涉及同步刪除時先對照產品保存與稽核契約，明列目前缺口，不擅自把訊息收回等同正式帳本刪除。

## 連線與統計

依 [TLS 規格](https://developers.line.biz/en/docs/messaging-api/ssl-tls-spec-of-the-webhook-source/) 核對公開 CA 簽發憑證、主機名稱、憑證鏈及 TLS 協商。文件目前支援 TLS 1.2／1.3；cipher／HTTP 相容性查當次表格，不用 deprecated cipher 或關閉驗證掩蓋錯誤。

[Webhook error statistics](https://developers.line.biz/en/docs/messaging-api/check-webhook-error-statistics/) 需開啟 Use webhook 與 Error statistics aggregation；只統計啟用期間，無法回補。Verify URL 的測試請求不在其中，沒有統計不代表連線正常。Console 時間是 UTC+9，與台灣日誌比對時要轉換。

| 原因 | 最小查證 |
| --- | --- |
| `could_not_connect` | 查 detail 的 DNS、連線、TLS 或協商錯誤，與 proxy 日誌交叉核對。 |
| `request_timeout` | 查 ingress／handler 耗時與實際副作用；官方原因表以 2 秒未回應說明，逾時不代表沒收到或沒寫入。 |
| `error_status_code` | 查實際狀態及該請求路徑，不一律歸咎驗簽。 |
| `unclassified` | 保留時間及連線中止資訊，用服務端證據縮小原因。 |

交付可重現輸入、觀察、修正與驗證結果。区分 URL 測試、真實事件接收、持久化與回覆送達，不把單一成功回應視為整條鏈路驗收。
