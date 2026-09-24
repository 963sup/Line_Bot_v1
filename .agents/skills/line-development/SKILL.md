---
name: line-development
description: LINE 跨產品開發、架構選型與整合排錯；處理 Provider／channel、憑證、產品能力及上線驗收。需求跨 Bot、Login、LIFF、MINI App 或尚不確定用哪個 API 時使用；單一專題直接用專用技能。
---

# LINE 開發整合

從使用者要完成的操作判斷產品、身分、資料及副作用，對照 LINE 官方能力、repository 現況與實際 evidence，定位缺口後選擇必要的 integration surface。這是跨產品入口，不要求每個 LINE 任務載入全部技能。先讀相關專案契約與現有 SDK／adapter／測試；能力存在於官方文件不代表本專案已實作、該帳號已獲資格或已通過實機驗收。

## 按問題選路徑

| 任務 | 主要入口 |
| --- | --- |
| Provider、channel、權限、token 選擇或 Console 環境錯配 | [平台與憑證](references/platform.md) |
| 收訊、原生 mention、群組、下載、回覆、推播或 Webhook 故障 | [Messaging API](../line-messaging-api/SKILL.md) |
| 圖文選單、個人化、分頁切換 | [Rich menus](../line-rich-menus/SKILL.md) |
| 卡片、carousel、影片、JSON 與渲染 | [Flex messages](../line-flex-messages/SKILL.md) |
| OAuth／OIDC、帳號關聯、錯 channel 或 token 生命週期 | [Login](../line-login/SKILL.md) |
| LIFF 初始化、分享、掃碼、登入接續、MINI App 審核或服務訊息 | [MINI App／LIFF](../line-mini-app/SKILL.md) |
| Pay、Social Plugins、Ads、Conversion、企業 API、原生 SDK、Mini Dapp 或鏈上能力 | [其他產品的選型與查證](references/product-boundaries.md) |

## 從需求到驗收

1. 定義可觀察結果：誰、在哪種聊天室／瀏覽器、觸發什麼、應看到什麼或改變什麼。欠缺環境資訊時先查設定與可用工具；只有會阻擋正確決策的資訊才詢問。
2. 分開已知事實、官方限制、專案規則及假設。串起「入口 → LINE 身分 → 產品授權 → 業務狀態 → 外部效果」，找到缺少證據的那一段。好友、登入、群友、verified MINI App、付費訂閱與產品 active member 不互相替代。
3. 比較必要的選項：原生 URI／quick reply／rich menu 是否已足夠，何時才需要 Flex、LIFF 或服務端工作。保留使用者指定方案，不為統一架構新建通用框架。
4. 以官方 guide 理解流程，再開 endpoint reference 核對 HTTP 方法、host、token 類型、必要欄位、限制、錯誤與重試。以 installed SDK 型別驗證方法簽名，不憑記憶生成不存在的 API。來源以 [LINE Developers](https://developers.line.biz/en/) 與其連出的官方產品文件為主。
5. 產出能直接修正根因且可檢閱的變更：相關程式／設定／JSON、精確目標、失敗處理與必要恢復方式。依既有授權完成；設計任務不擅自變更 Console，真實發訊息必須已有發送授權。
6. 測試實際不變條件：錯身分不能寫入、重複事件不重複副作用、取消可返回、結果未知不盲目再送。只跑相關測試及專案必要檢查，不為文件變動跑無關全套建置。

## 排錯證據

保留去識別化的時間與時區、channel／內部環境、SDK／LINE／OS 版本、endpoint、HTTP 狀態、request ID、webhookEventId 及副作用結果；不保存秘密或不必要聊天原文。

先區分未發出、LINE 拒絕、已接受但未見效果、使用者操作未完成；再用能精確區分假設的重現與 evidence 查根因。跨 API 同時失敗時查 [LINE API Status](https://api.line-status.info/) 與 [公告](https://developers.line.biz/en/news/)，但公告不能取代自身 request／handler 證據。記錄公告發布日、生效日及受影響版本，不把未來政策當現在已生效。

## 證據與成本標準

交付修改位置、來源日期、驗證結果及剩餘缺口。分清本地型別／測試、官方 validate、API 接受、手機顯示、業務完成及正式環境觀察，未做的層級明列未驗證。

成本同時考慮 LINE 計費訊息、媒體、AI 令牌、API 配額、維護與人工操作。不能把一次 HTTP request 等同一則計費訊息，或把縮短技能字數當成已量測的令牌節省。

技能更新時用 [情境驗證](references/scenarios.md) 檢查選路及錯誤決策；只有實際執行過的情境才能回報行為測試通過。
