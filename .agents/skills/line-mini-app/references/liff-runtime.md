# LIFF 執行、導航與功能判斷

來源核對：2026-09-07。從 [Developing LIFF apps](https://developers.line.biz/en/docs/liff/developing-liff-apps/) 與 [LIFF reference](https://developers.line.biz/en/reference/liff/) 查本次 SDK 方法。

## 初始化與網址

- 確認每個新頁面的初始化生命週期；SPA 的 render 重跑不代表需並行啟動多次 init。沿用既有初始化責任，不自行改寫 window.liff。
- 捕捉 `liff.init()` 的失敗；`liff.ready` 在 init 失敗時不 reject，只等 ready 可能讓載入畫面永遠等待。
- Init 頁應在 endpoint URL 本身或下層路徑。對照 primary／secondary redirect，必要時兩段都初始化；先完成 init 再進行業務導航，不先移除或改写 liff.* 參數。
- 初始化 URL 可能含暫時認證資訊，不先交給 analytics／日誌收集。外部登入回跳、endpoint 與永久入口要分別核對，不能靠反覆 login／reload 掩蓋錯誤。

## 能力判斷

| 功能 | 實作前核對 |
| --- | --- |
| 外部瀏覽器登入 | init 完成、isLoggedIn、登入取消與 return URL；依需求使用 withLoginOnExternalBrowser，不讓純公開頁無條件循環登入。 |
| sendMessages | 當前聊天、chat_message.write、啟動情境及 method 支援；不能承諾在任意外部瀏覽器向任意 user 發訊息。 |
| shareTargetPicker | 可用性、登入與使用者選擇／取消；不能從結果推測選了誰或把取消當成功。 |
| 掃碼 | 核對 scanCodeV2 等實際方法的版本／平台支援與權限，不因 API 存在就假設每個 WebView 可用。 |
| friendship | 對應的 linked Official Account 與 profile scope；好友狀態不取代產品會員。 |
| closeWindow／openWindow | 依方法支援環境安排行為；返回後讀取最新狀態，不假定背景頁仍持續執行。 |

API 支援檢查依方法使用 isApiAvailable 或官方指定條件，不對所有方法盲套同一個檢查。保留可用的網頁 fallback 與可理解錯誤；只做當次需求需要的功能。

## 瀏覽器與永久入口

[瀏覽器差異](https://developers.line.biz/en/docs/liff/differences-between-liff-browser-and-external-browser/) 列出 Service Workers、download attribute、一般 A2HS 等限制；不要將 PWA 背景同步或瀏覽器下載功能直接當 LIFF 保證。LINE in-app browser 與 LIFF browser 也不同，判斷實際能力，不只讀 user agent。

依 [MINI App permanent links](https://developers.line.biz/en/docs/line-mini-app/develop/permanent-links/) 保留 endpoint 之下的 path／query／fragment；有支援 SDK 方法時優先使用。若自行組合，使用 URL 語意與明確 endpoint 關係驗證，不對任意字串做 replace。連結不帶認證 token，開啟私人資源後仍由後端授權。

驗證矩陣按任務選 Android／iOS、LIFF／外部瀏覽器、登入／未登入、缺 scope、取消、深連結、返回及重新整理。Simulator 或桌面 browser 不能取代手機 LIFF 證據。

## 導航與入口反例

補充核對：2026-09-09。修改接續時先列正式 URL、LIFF endpoint、初始化 ID、後端預期 channel 與必要業務參數，再選下列案例；沿用現有身分核驗，不為檢查建立新的 session 或 `/auth/line`。

| 案例 | 應核對的結果 |
| --- | --- |
| endpoint 為 `/foo`，路徑為 `/foo/bar` 或 `/foobar` | 前者是下層路徑，後者不是；同時驗證 origin，不用字串共同前綴推導安全目的地。 |
| 舊入口帶 `liff.state` | 讓 SDK 完成必要接續後才解析業務意圖，不自行解碼平台狀態。 |
| 同 pathname、不同分類參數 | 比較必要 query，避免只比較 pathname 而漏掉視圖更新；正規化不得形成重導循環。 |
| 直接開啟、站內切換、重新整理、返回／前進 | URL 與視圖一致；保留允許的業務意圖，不把 code／token 複製到產品連結。 |
| 公開頁、登入取消、換帳號 | 公開頁不因通用初始化範例強制登入；取消可恢復，私有資料依既有資格與生命週期重新核驗。 |
| Developing／Review／Published | 啟動入口、LIFF ID、endpoint 與後端預期 channel 屬於同一環境；不由部署成功推定設定一致。 |

以上是待執行的驗收案例，不表示已完成手機或 Console 驗收。平台依據見 [LIFF 初始化](https://developers.line.biz/en/docs/liff/developing-liff-apps/)。

## 除錯工具與 SDK 體積

| 實際問題 | 按需工具與邊界 |
| --- | --- |
| 桌面無法重現手機 LIFF 問題 | 查 [LIFF Inspector](https://developers.line.biz/en/docs/liff/liff-plugin/#liff-inspector) 的裝置除錯方式；只在開發環境接入，輸出不得帶 token 或私人 profile。 |
| 需要重現 SDK 回應與 UI 分支 | 查 [LIFF Mock](https://developers.line.biz/en/docs/liff/liff-plugin/#liff-mock)；沿用既有測試替身能完成時不另加工具。Mock 不證明登入、授權或手機功能可用。 |
| 需要本地 LIFF 開發工具 | 從 [LINE LIFF 文件](https://developers.line.biz/en/docs/liff/) 的 Tools 入口核對 CLI 當前命令與先決條件；先用既有 dev server，不因範例建立新 app、公開 tunnel 或修改 Console。 |
| 量測顯示 SDK 體積是瓶頸 | [Pluggable SDK](https://developers.line.biz/en/docs/liff/pluggable-sdk/) 限 npm 版 LIFF v2.22.0 以上；盤點所需方法，於 init 前註冊模組。CDN 版不能直接 tree-shake，遷移需另有範圍與驗證，不承諾固定縮減比例。 |

取材線索：[abgne LIFF 索引](https://github.com/abgne/line-dev/blob/main/skills/line-liff/SKILL.md)、[既有 Web 整合檢查](https://github.com/kj-aiml/line-mini-app-integration/blob/master/skills/line-mini-app-integration/SKILL.md)。本節依官方文件與本專案契約重新整理，未匯入其模板、驗證器或技能套件。
