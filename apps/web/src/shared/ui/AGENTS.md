# Shared UI boundary

## GitHub Mobile 目標（後續實作）

以下為本產品採用的 Mobile 視覺目標，不宣稱數值是 GitHub 官方 design tokens。

- 單欄、內容優先：緊湊 header → 分區／filter → list/detail → 必要操作；不為工作頁加入大型宣傳 hero、裝飾漸層或每個欄位一張重複大卡片。
- 全域 tab 使用 icon＋短標籤＋可見 active state；一次只有一個 active destination，主 tab 定義由 app 傳入。不要只靠顏色或無語意 emoji 傳遞狀態。
- List row 的主名稱、次要 owner/context、狀態和尾端操作有清楚閱讀順序；長名稱可換行，metadata 可次要化，必要識別不能只剩省略號。detail body/comments 使用閱讀友善寬度與間距。
- 使用 system font 與明確 title/body/metadata 層級；中性 surface、細分隔線、克制 accent，狀態 icon＋文字。支援明暗背景的對比；不複製 GitHub logo/品牌資產或把 iOS Liquid Glass 當必要功能。
- 主要可點區目標至少 44×44 CSS px；保留鍵盤 focus、合理 heading 次序、screen-reader label、aria-current 與文字縮放。這是本地設計目標，不等於已完成可及性驗收。
- 底部 tab/固定操作區考慮 safe-area 與軟鍵盤；scroll content 留足 padding，不遮最後一列、留言或確認按鈕。窄螢幕標題不與多個不換行按鈕爭寬度。
- 危險操作放明確 overflow/詳情並確認；sheet/dialog 必須管理 focus、關閉/返回與未完成輸入，不因外觀改成一滑即提交。沒有本地 command 的 swipe/bulk action 不建立。
- Shared primitive 接 slots/children/callback；不得讀 owner store 或決定 resource 權限。Feature-specific row、timeline、resource nav 留在 module，證明共用需要後才抽組件。
- 後續驗證 320/390px、較寬視窗、200% 文字縮放、長中文/英文 locator、loading/error/empty、public/private 與鍵盤；實際截圖＋互動證據優先於「看起來像 GitHub」的主觀宣稱。

## 現行機制與 invariant

不擁有固定 business URL；back/action 的 href 由 app/feature caller 提供。FPT resource 分類不產生通用 ResourcePage 或 CRUD 組件需求。

修改 PageHeading、ActionRow、PageState 等要查不同 consumer 的背景、手機換行、鍵盤與 loading/error/empty 語意；不要讓淺色／深色頁面共用不相容樣式卻只驗其中一頁。Feature navigation 留在 owner，可組裝中立 primitive。

- Shared UI owns visual composition and accessibility primitives, not domain policy, authorization or resource lifecycle.
- Feature-specific labels, actions and state mapping remain with the feature module; do not make generic components silently infer business status.
- UI affordance, disabled state and navigation never substitute for server-side owner validation.
