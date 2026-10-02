# LINE webhook reference
## Inbound verification
Webhook 必須先以原始 request body 驗證 LINE signature，再解析事件。Signature 建立 provider transport trust：request 來自持有該 channel secret 的 LINE Platform 且 payload 未被竄改；它不證明 human actor 或 business permission。Webhook `destination` 保留為 receiving-bot provider context，但 current runtime 不再用 business persistence 重複決定 transport admission。

事件的 `source.userId` 是發出訊息的人類 LINE subject；server 仍須依 identity mapping 解析實際 `User`／current `Member`，再驗證 scope、qualification 與 permission。人類 intent 缺少 `source.userId` 或無法驗證 mapping 時必須拒絕，不得以 `destination` 冒充 actor。非人類 provider events 仍由對應 protocol flow 擁有，不虛構 human actor。Bot delivery 人類 command 結果時不得以 receiving destination 取代 actor 或 authority。

1:1 `user` scope 的普通文字可在 actor qualification 通過後作為 Assistant 問答 intent；`group` / `room` 的普通聊天不得因 Bot 收到就送模型，只有 LINE 原生 self mention 或既有明確指令才可喚醒。任何 chat scope、未授權圖片或問答 intent 都不得自動建立 business record。
## Conversation scope
Webhook conversation context 與 human actor 必須分離：`source.userId` 是 actor；`source.type` + 對應 scope id 只是 transport conversation context。Private `user` scope 使用該 `userId` 作 conversation scope；`group` 必須帶非空 `groupId`；`room` 必須帶非空 `roomId`。缺少必要 scope id 的事件不建立 Assistant conversation，也不得以 bot `destination` 或其他 fallback 補值。

Current activation policy：

- 1:1 `user`：普通文字在既有 actor authorization 通過後可直接進 Assistant；不要求使用者額外 @Bot。
- `group` / `room`：普通文字保持沉默；Assistant 問答只接受 LINE 原生 self mention，既有 explicit command 仍依各自 handler 規則處理。
- conversation scope 只隔離 interaction context，不授予 Organization、Team、Employment、Repository 或其他 business permission。

這個 policy 由 Webhook router 執行；`@line_bot_v1/line` 只負責可信 provider source parsing，不擁有 Assistant product policy。
## Event claim and replay
跨 instance 的短效 Webhook claim 可以使用 Redis，但 Redis 只負責有限 TTL 協調；持久 business idempotency / ledger authority 仍在 PostgreSQL。

- completed claim 可以回放已保存的 transport result。
- pending / lost claim 不假裝成功。
- Redis fault 在必要去重流程中應明確失敗，不退回 process-local Map 宣稱具有跨 instance 保證。
- LINE 是否重送由平台行為決定，系統不能宣稱 exactly-once。
