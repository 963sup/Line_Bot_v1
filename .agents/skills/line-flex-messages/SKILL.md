---
name: line-flex-messages
description: 建立、修改或診斷 LINE Flex Message 卡片、bubble／carousel 排版、影片與 Simulator 預覽；適用於訊息 JSON 和渲染問題，不處理純 MINI App 網頁 UI。
---

# LINE Flex Messages

先界定收件者需要讀懂的資訊與下一步操作，讀取 [LINE integration](../../../docs/030-platform/010-line.md) 及本次 presenter／型別／測試。選擇足以完成任務的最少內容；一張卡片能完成就不增加 carousel、影片或通用卡片框架。保留使用者明確指定的 Flex 需求。

## 結構與互動

1. 分開 message 外殼與 container：送出物件是 `type: flex`、有意義的 `altText` 與 `contents`；`contents` 才是 bubble 或 carousel。不要把 Simulator 的 bubble JSON 直接當完整 message request。
2. 按 container → block → component 建立。Bubble 的 header、hero、body、footer 各至多一個，按此順序顯示，不需全放。多筆可比較內容才使用 carousel。
3. 使用 LINE 支援的 box、text、button、image 等欄位，不把網頁 CSS／HTML 原樣移入 JSON。Icon 放 baseline box，span 放 text 的 contents；避免新增已棄用的 filler。
4. 為長文、缺值、大字體及多語內容設計換行與合理的 `maxLines`。需要完整閱讀時不要只依靠截斷；`altText` 說明內容及目的，也要避免在通知預覽暴露不必要的私人資料。
5. URI 負責開頁、message action 產生文字、postback 承載操作資料；點擊資料不是授權證據。群組卡片中的私人資料入口仍由服務端核驗會員、owner 與 scope。

## 排版診斷

先縮成能重現問題的 bubble，再逐一調整。Horizontal box 的子項 `flex` 預設為 1，vertical 預設為 0；比例分配與固定寬高不同。`justifyContent` 要有剩餘空間，所有子項的 flex 為 0 才能按文件分配空間。子項 `margin` 優先於父 box `spacing`；不要用大量固定像素或 absolute 定位掩蓋長文溢出。

複雜對齊、padding、文字縮放與尺寸只查 [Layout](https://developers.line.biz/en/docs/messaging-api/flex-message-layout/) 的相關段落及 [API reference](https://developers.line.biz/en/reference/messaging-api/) 的實際欄位；CSS 類比不取代 LINE schema。

## 只有需要影片時

- Video 放 bubble 的 hero，bubble size 使用 `kilo`、`mega` 或 `giga`，不能是 carousel 子項。
- 核對 HTTPS 影片／預覽 URL、媒體規格與可讀取性；影片、previewUrl 圖片及 `aspectRatio` 保持一致。
- 設定可用的 `altContent`（image 或 box）供不支援影片的版本使用；它不同於 message 的 `altText`。
- Simulator 顯示替代內容，不能預覽影片播放。手機自動播放取決於使用者設定，桌面版不支援自動播放；成功送出不能证明可播放。

## 驗證與交付

1. 以已安裝 SDK 型別及當次 reference 核對 action、文字／JSON 大小、bubble 數量與版本支援。輸出可解析的 JSON，不含教學註解或秘密。
2. 使用 [Simulator 教學](https://developers.line.biz/en/docs/messaging-api/using-flex-message-simulator/) 的 View as JSON → Apply 匯入 container，檢查預覽，修改後匯出並與實際送出內容對照。沒有操作工具就交付 JSON 與待驗項，不假稱完成預覽。
3. 有可用憑證時，使用對應 reply／push 的 message validate endpoint 驗證訊息；validate 不發送，也不證明送達或版面。
4. 實際發送及 reply／push 選擇依 [Messaging API](../line-messaging-api/SKILL.md) 與既有收件授權。Simulator 的 Send 也是真實發送。只有使用者已授權發訊息才執行。
5. 按目標裝置驗證長文、大字體、圖片載入、操作入口及影片／fallback。裝置 OS、LINE 版本、解析度、語言與字型可能改變渲染，不能只以單一預覽宣稱跨平台通過。

交付最終 JSON／修改位置、內容取捨與本地、API、Simulator、實機各層結果。成本考量包含訊息發送、媒體載入與維護、產生內容的令牌；未量測就不報效益比例。

## 按需查官方文件

需要收據摘要或 Quick Reply 起點時，讀 [訊息範例](references/message-examples.md)；範例只示範 JSON 結構，不能直接當正式資料或已授權發送。

核對日期：2026-09-07。易變限制及版本支援在實作時重查。

- [Send Flex Messages](https://developers.line.biz/en/docs/messaging-api/using-flex-messages/)：message 外殼、支援環境與發送。
- [Elements](https://developers.line.biz/en/docs/messaging-api/flex-message-elements/)：container／block／component。
- [Video](https://developers.line.biz/en/docs/messaging-api/create-flex-message-including-video/)：結構限制、比例、播放及替代內容。
