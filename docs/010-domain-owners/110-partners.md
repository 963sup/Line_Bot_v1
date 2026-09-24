# Partners

本文件擁有合作夥伴、聯絡窗口、推薦案件與其業務生命週期。Team participation、LINE Rich Menu、資料表、部署與驗收證據由其他 owner 維護。

## 核心概念

合作夥伴名錄是「已發布、可供合格使用者使用的窗口資料」；推薦案件是「使用者提出、等待審核的候選資料」。兩者不能混為同一狀態，也不會授予 TeamMembership 或 TeamManager 資格。

使用者端提供最新消息、合作夥伴與本人夥伴推薦三種視圖；管理端完整名錄必須具備獨立 `partners.manage` 權限。

## 推薦流程

qualified active User 可以提交推薦；案件 lifecycle 為 `pending -> successful | rejected | withdrawn`。只有提交者本人可撤回 pending；`partners.review` 才可審核。TeamManager 或 `partners.manage` 不自動取得推薦審核權。Successful 審核必須與建立正式 Partner/Contact 在同一 transaction 完成，已結案案件不可再次審核或撤回。

## 名錄與窗口管理

`partners.manage` 是名錄管理的獨立 feature permission。每個合作夥伴至少 1、最多 20 位窗口；每位窗口至少保留電話、Email 或 LINE 一種聯繫方式；既有窗口用 stable ID 保留，不以刪除／移轉取代下架；published partner 至少一位 published contact。資料修改需格式檢查、原因、聯繫方式與分享同意確認。

一般 LINE 搜尋 ID 只是可複製文字；可點擊連結只接受受限電話、Email 與 LINE 協定／網域。

## 權限邊界

- `partners.manage`：完整名錄維護。
- `partners.review`：推薦案件審核。
- 推薦提交與撤回：qualified active User 本人。
- TeamManager、工作地點管理者或其他管理權限不自動包含上述權限。

權限在每次敏感操作重新核驗；等待 transaction lock 期間若權限被撤銷，操作不得沿用舊判斷提交。

## 命令與一致性

寫入使用 `requestId` 防重；相同 ID 搭配不同內容拒絕。名錄保存另以 `expectedVersion` 做 optimistic concurrency；推薦成功與正式名錄發布是同一 transaction 結果。

## 與其他模組的邊界

- Team/TeamMembership/TeamManager 由 [Team](070-team.md) 擁有。
- Account/User 提供 current human qualification；Partners 不建立第二套 human identity alias。
- LINE 選單只導向視圖，不定義授權／狀態。
- Feature permission 的授予／撤銷由 Identity/Access／Security owner 擁有。
- persistence、schema、transaction 與 cursor 實作由 [Data](../040-data/README.md) 擁有。
- 遠端 migration、LINE 發布與手機驗收狀態不寫在本文件。
