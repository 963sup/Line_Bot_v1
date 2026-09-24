---
name: line-messaging-api
description: 開發、診斷或審查 LINE Messaging API Webhook、驗簽、重送、群組事件、使用者同意、SDK 與回覆／推播；純卡片排版或圖文選單使用對應專用技能。
---

# LINE Messaging API

先讀 [LINE Messaging](../../../docs/030-platform/010-line.md)，定位 Webhook route、LINE adapter 與相關測試。業務觸發、收圖窗口及通知規則由主文件維護，不在 skill 另存數值。

## 文件與環境

Context7 可用時先 resolve `LINE Developers`，選官方文件庫，再 query 單一 endpoint 或事件；同一任務重用已解析且仍適用的 ID，來源或版本改變時才重新解析。查詢不帶秘密、聊天原文或私有程式。不可用、缺漏或來源矛盾時開啟官方原頁。

從 manifest 核對 SDK 版本，區分 channel secret、channel access token 與使用者登入 token。當次查證 schema、配額、費用及 retry 支援，不硬編舊範例限制。

優先沿用現有官方 SDK／adapter，不因教學範例重寫傳輸層。[SDK 官方清單](https://developers.line.biz/en/docs/messaging-api/line-bot-sdk/) 區分持續維護、archive 與 community；列在頁面上不代表仍獲官方維護。只在目前 SDK 確實缺少功能時評估直接 API 或官方 OpenAPI，不預先生成整套 client。

先界定觀察到的失敗及成功條件，再核對來源、身分、狀態、副作用；區分官方限制、專案契約與待驗假設。只修有證據的斷點。詳細內容按任務載入：

- Webhook URL、TLS、收訊及錯誤統計：[接收與診斷](references/webhooks.md)。
- 群組、room、缺少 userId 或 profile：[群組與同意](references/groups-consent.md)。
- 發送方法、retry key、受眾、配額或計費：[發送與營運](references/sending.md)。
- 原生 account linking：[帳號關聯](../line-login/references/account-linking.md)；不因教學另建會員系統。
- 圖文選單、per-user、分頁：[line-rich-menus](../line-rich-menus/SKILL.md)。
- 卡片 JSON、排版、影片及 Simulator：[line-flex-messages](../line-flex-messages/SKILL.md)。

## 工作流程

1. 以原始 body 驗證 `x-line-signature`：channel secret、HMAC-SHA256、Base64 及安全比較／適用 SDK，通過才解析 JSON。Next.js Route Handler 不直接套 Express middleware；驗簽失敗不得觸發業務。
2. 處理空 events、多事件、未知事件與缺少使用者身分。依可信 source 分隔 user／group／room，再依 [Account](../../../docs/010-domain-owners/010-account.md) 授權，不信任群組連結或文字角色宣告。
3. 使用 `webhookEventId` 設計防重；`isRedelivery` 只是提示。重送可能亂序，資料寫入與外部回覆不在同一交易；依現有持久化契約處理，不把程序快取稱為跨實例防重。
4. 分辨 reply／push 的 token、收件條件與成本。reply token 不重複使用；結果不明先查證，僅在 endpoint 支援時以相同 retry key 重試，不盲目重送或改 push。
5. 按任務查文字／Flex／rich menu／內容下載 API。普通聊天與圖片是否處理依主契約；下載及 AI 不因收到事件自動觸發。真實發送前形成可檢閱內容，核對收件目標及既有授權。

針對本次修改選擇相關驗證：偽造簽章、原文改動、重複事件、群組／會員隔離、外部逾時及成功路徑。程式修改使用 repository validate；僅技能／文件修改檢查格式、連結及契約一致性。Webhook 200、API 接受、實際送達與使用者完成操作分開回報。

解析器、正規化或事件重複處理需要涵蓋多種輸入及排列時，可搭配 [property-based-testing](../property-based-testing/SKILL.md)，先從契約定義不變條件。一般 endpoint 範例測試不必追加此方法；產生式測試不證明 LINE 實際送達。

## 官方入口


- [Messaging API 文件](https://developers.line.biz/en/docs/messaging-api/)：設定、訊息與操作指南。
- [API reference](https://developers.line.biz/en/reference/messaging-api/)：endpoint、限制與重試條件。
- [Webhook 驗簽](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)：原始 body 要求。
- [接收與重送](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)：事件交付及重複處理。
