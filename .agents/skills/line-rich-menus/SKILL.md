---
name: line-rich-menus
description: 建立、更新或診斷 LINE 圖文選單 rich menu、個人化選單及分頁切換；處理圖片、點擊區域、alias 與顯示優先序。聊天內卡片使用 line-flex-messages。
---

# LINE 圖文選單

先確認使用者在官方帳號聊天室要完成的操作、目標受眾及現有選單由誰管理。讀取 [LINE Messaging](../../../docs/030-platform/010-line.md)，保留既有入口與會員授權；顯示某個選單不代表使用者取得權限。

## 第一性原理與根因決策

- 靜態共用入口可使用 Official Account Manager；需要 per-user、postback 或分頁切換時使用 Messaging API。保留使用者已指定的工具。
- 同一選單不能由 Manager 與 API 互相讀取或編輯；先辨識建立工具，不能因 API 查不到就判定帳號沒有選單。
- 顯示優先序為 API per-user → API default → Manager default。Rich menu 不顯示於桌面版 LINE；驗收以手機官方帳號聊天室為準。
- 先確認真正 navigation / audience / state 問題與現有 menu authority，再用高手思維對照 LINE 原生能力；根因確認後以奧卡姆剃刀移除沒有責任的 menu／alias。只有明確個人化或分頁需求才增加它們。比較成本時包含圖片製作、維護、API 操作與上下文用量，不捏造節省比例。

## 建立與變更

1. 盤點精確 channel、既有 default、目標使用者的 link 與 alias 對應，記下可恢復的舊 ID。先產出圖片、rich menu JSON、影響對象及變更順序。
2. 以當次 [API reference](https://developers.line.biz/en/reference/messaging-api/) 核對 rich menu object、圖片尺寸／容量、區域數量及 action 限制。圖片與 `size`／`areas[].bounds` 要對齊；檢查區域越界、重疊與空隙是否符合設計，不照抄範例座標。
3. 驗證 JSON 後建立 menu，取得 `richMenuId`，上傳圖片，再設 default 或 link user。建立 JSON 成功不代表已有圖片或已顯示。JSON endpoint 使用 `api.line.me`，圖片上傳使用 `api-data.line.me`。
4. Per-user link 使用可信 LINE userId，先查當前好友及 linking 條件；不是 groupId、email 或前端自報 ID。解除個人 link 後才會回到可用的 default。個人設定即時生效；API default 通常需重開聊天室，可能最多約一分鐘。
5. 分頁用原生 `richmenuswitch` action 的 `richMenuAliasId` 與 `data`，alias 指向實際 menu ID。建議所有目標 menu、圖片及 alias 就緒後才開放入口，避免發布半完成分頁。純切頁不另做 Webhook 往返；業務 postback 才按 [Messaging API](../line-messaging-api/SKILL.md) 驗簽及授權。
6. 切頁後是高優先序的 per-user 狀態；更換或清除 default 不會覆蓋它。下架時分清取消 default、解除 user link、刪 alias、刪 menu 的不同效果。只需停止某人顯示就 unlink；刪 menu 未先 unlink，可能要重開聊天室才消失。

真實設定變更需落在使用者既有授權的 channel 與受眾範圍內。若只要求設計或 JSON，交付可檢閱產物即可。外部結果未知先讀回狀態，不盲目重建、批次綁定或刪除舊資源。

## 驗證與交付

先使用 rich menu validate endpoint（有可用憑證時），再讀回 menu、圖片、default／link／alias。手機檢查每個點擊區域、A→B→A、解除 link 後回復 default，以及重開聊天室行為。優先選已授權測試對象，擴大影響前檢查實際結果。

交付 JSON／圖片位置、目標與舊新 ID 對應、已執行操作及證據。分開報告本地幾何／格式檢查、LINE API 接受與手機顯示；未有手機證據不能宣稱實機通過。

## 按需查官方文件

核對日期：2026-09-07。實作時重查易變限制，不將本技能當完整 API 規格。

- [Overview](https://developers.line.biz/en/docs/messaging-api/rich-menus-overview/)：工具能力、優先序及生效時機。
- [Use rich menus](https://developers.line.biz/en/docs/messaging-api/using-rich-menus/)：建立、上傳圖片、設定 default。
- [Per-user menus](https://developers.line.biz/en/docs/messaging-api/use-per-user-rich-menus/)：link／unlink。
- [Switch rich menus](https://developers.line.biz/en/docs/messaging-api/switch-rich-menus/)：alias、分頁與移除效果。
- [Rich Menu Playground](https://developers.line.biz/en/docs/messaging-api/try-rich-menu/)：手機上體驗原生 action 的日文示範帳號；適合探索互動，不是自己 channel 的驗收證據。
