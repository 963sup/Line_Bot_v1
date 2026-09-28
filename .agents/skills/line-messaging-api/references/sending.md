# 發送、重試、配額與操作

來源核對：2026-09-07。先建立精確收件目標、訊息內容、觸發原因與授權；需要真實發送時才執行發送 endpoint。

## 發送方法

依 [Send messages](https://developers.line.biz/en/docs/messaging-api/sending-messages/) 選擇：reply 對應事件；push 指定 user／group／room；multicast 指定多個 user；narrowcast 指定受眾條件；broadcast 對所有好友。不能為方便測試，把指定單人擴成 broadcast。

以 [API reference](https://developers.line.biz/en/reference/messaging-api/) 重查 reply token 有效條件、單次訊息數、push 可收件條件、受眾資格及 narrowcast progress。排程工作不能囤 reply token；接受 narrowcast 請求後還需查進度，不將接受等同完成。

文字／quick reply 足夠就不增加 Flex；需要卡片用專用技能。字符限制先辨認 reference 用 UTF-16 code units 或 grapheme cluster，不把 JavaScript length 一律當可見字數。API 需要的圖片／影片 URL 應能被平台取得，不能傳 localhost、需互動登入或不符合媒體規格的來源。

## 外部結果未知

依 [Retry failed API requests](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/)：

- Push／multicast／narrowcast／broadcast 在第一次請求就帶 `X-Line-Retry-Key`。同一操作重試保持相同鍵、收件者與 payload；reply 等不支援端點不能加這個 header。
- 500 或 timeout 在有效重試期間使用同鍵與有界 backoff；停止於成功、已接受、不可重試錯誤或預定期限。重試鍵目前有效 24 小時，不代表訊息保證送達。
- 2xx 不重試；409 搭配已接受語意及 `x-line-accepted-request-id` 表示先前已接受，不新生鍵再送。4xx 先修輸入、資格或配額，不盲目重送。
- 保存業務操作與 request ID／retry key 的必要關聯；程序重啟後若失去此關聯，就不能宣稱跨重啟防重。Webhook 去重與 API 發送防重是兩個邊界。

## 計費與診斷

依 [Pricing](https://developers.line.biz/en/docs/messaging-api/pricing/) 查服務地區與實際方案；日本範例不是台灣報價。計費訊息以收件人數為基礎，不以一包 JSON 裡的 message object 數量計算。Reply 不列入該方案訊息計數，push／multicast／narrowcast／broadcast 會列入。

429 區分短期 rate limit、併發限制與月配額，查 response／quota／consumption；增加重試不會解決月額用完。日統計或 insight 不當成逐人送達回條，機器回 200 也不等同群友已閱讀。

測試同鍵重試、首次成功但呼叫端 timeout、409、4xx、配額不足、重啟後重試及群組收件範圍。用替身驗證時明確標示；只有已授權的真實發送結果才能作送達證據。
