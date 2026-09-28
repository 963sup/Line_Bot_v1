# LINE mini-app reference

## Environment identity

MINI App 的公開永久入口是產品／LINE Console identity，不是 secret。Current source 只由 `apps/web/src/shared/server/line-mini-app.ts` 擁有 Developing、Review、Published 三個 `https://miniapp.line.me/...` permanent URL；本文件不複製實際值作第二份 source of truth。

同一 stage 的三個值只由該 URL 派生：

```text
MINI App permanent URL
→ LIFF ID（SDK init）
→ Channel ID（server token audience verification）
```

LINE MINI App lifecycle 與 deployment provider 是兩個獨立軸，不從 `VERCEL_ENV`、branch 或 deployment target 推導 stage。Current source 以 `CURRENT_LINE_MINI_APP_STAGE` 明確指定目前 stage；現階段為 Developing。進入 Review 或 Published 時，必須以 source change 明確切換並重新驗證 Web／server audience／Rich Menu。

Rich Menu / Messaging URI 直接使用 current `miniapp.line.me` permanent-link domain 加白名單 intent；MINI App identity 只由 source-owned current-stage permanent URL 派生。

## 初始化

Web 端透過 LINE LIFF SDK 初始化 MINI App runtime。初始化完成前，呼叫端不得根據 URL 推定已取得可信 LINE 身分或直接執行業務命令。

目前共用 runtime 會：

1. 載入 LIFF SDK。
2. 初始化 LIFF client；開發環境可明確啟用 LIFF mock。
3. 初始化完成後才交回各功能繼續核驗與載入。
4. SDK 載入或初始化失敗時顯示可重試錯誤，不把失敗當成匿名成功或空資料。

LIFF browser 與 external browser 是不同 runtime context。依目前 LINE 平台行為，外部 browser 中 `liff.init()` 本身不等於完成 LINE Login；需要 LINE Login 的流程必須明確處理登入，再把 provider proof 交給 server 驗證。

## 入口 intent

MINI App URL 使用固定白名單 intent 接續 Web surface。入口只決定使用者想去哪裡，不授予資料或操作權限。

目前白名單包含：

`planned`、`team`、`notifications`、`repositories`、`partners`、`feedback`、`clockIn`、`clockOut`、`membership`、`attendance`、`expense`、`records`、`register`、`restore`。

一般 boolean intent 必須只有一個值且為 `1`；`expense` 需要合法 UUID；`attendance` 可另帶白名單 operation。重複 intent、多個主要 intent 或非法 operation 應視為 invalid，而不是猜測目的地。

LIFF 自己產生的 `liff.state` 在 SDK 完成處理前視為 pending，不由 Web 提前解碼成業務操作。

## 登入與接續

登入接續只保存 Web 已知且必要的功能 intent 與白名單視圖，例如：

- 任務：`taskView=board|mine|publish`
- 合作夥伴：`partnerView=news|directory|referrals`
- 公告：白名單 `category`

接續網址不得複製 token、code、任意 return URL 或其他 credential-bearing SDK 參數。

URL 與頁面狀態只保存導覽意圖；直接開啟、重新整理或返回後，各功能仍必須重新取得可信身分並重新授權。

## 操作安全

- MINI App 入口不能因 Rich Menu 圖片、URL 名稱或前端狀態而自動推定合法業務狀態。
- 有副作用的流程由對應 module 決定是否允許首次入口自動執行；重開、未知結果與外部瀏覽器不得任意產生第二個命令。
- 前端 identity、member id、role 或 query parameter 都不能取代後端核驗。
- 結果頁只在可確認結果時顯示成功；未知結果必須提供查回或安全重試方式。
