---
name: line-mini-app
description: 開發、診斷或審查 LINE MINI App 與 LIFF 初始化、入口、瀏覽器接續及手機體驗；純 Webhook 使用 line-messaging-api，OAuth 核驗使用 line-login。
---

# LINE MINI App

讓指定 MINI App 在正確 channel、環境與瀏覽器完成使用者流程。先讀 [LINE integration](../../../docs/030-platform/010-line.md) 與 [Monorepo](../../../docs/020-architecture/010-repository-architecture.md)，沿用現有 Web，不因 skill 建立獨立 app。

## 文件與定位

- 查 manifest／lockfile 的 LIFF 版本、初始化與 route，再確認 Provider、channel 類型、LIFF ID、endpoint URL 及開發／審查／公開環境。一般 LIFF 網頁不等於已審核 MINI App。
- Context7 可用時先 resolve `LINE Developers`，選官方文件庫後 query 單一問題；同一任務重用已解析且仍適用的 ID，來源或版本改變時才重新解析。查詢不帶 token、個資或私有程式。
- Context7 不可用、內容缺漏或涉及地區／審核／服務訊息資格時，直接讀下列官方頁及相關子頁。來源矛盾時以官方原頁查核，記錄日期；OpenAI Docs 只作 skill 格式依據。

按任務載入詳細操作：

- 初始化卡住、深連結、分享、掃碼、瀏覽器能力與返回：[LIFF runtime](references/liff-runtime.md)。
- 導航反例、Inspector／Mock／CLI 選用及 SDK 體積評估：按需讀同份 [runtime 參考](references/liff-runtime.md#導航與入口反例)，不因工具存在而安裝或遷移。
- Developing／Review／Published 錯配、審核、template 與 notification token：[發布與服務訊息](references/release-service-messages.md)。

## 工作流程

1. 等待 `liff.init()` 成功才使用相依 API；處理初始化失敗、未登入、scope 缺少與功能不可用。避免 SSR 執行瀏覽器 SDK。
2. 將原始 ID token／access token 傳到後端核驗；前端 profile、decoded token 或 userId 不作後端授權。需要時讀 [line-login](../line-login/SKILL.md)，不得記錄 token。
3. 依 [Account](../../../docs/010-domain-owners/010-account.md) 與 [Supabase platform contract](../../../docs/030-platform/020-supabase.md) 處理內外瀏覽器，不假定 cookie／session 共用；LINE 身分證明不取代會員資格。
4. 分辨永久入口、endpoint 與登入 callback；跳轉保留必要狀態、限制目的地，不把秘密放 URL。服務訊息與 Messaging API 訊息的資格及用途分開查證。
5. 依改動驗證 Android／iOS LINE 內開啟、外部瀏覽器、取消登入、返回及重新整理。使用 repository 驗證入口；沒有手機實測就列待驗收。

回報修改位置、官方依據、已驗證環境與未完成步驟。審核、發布與部署依當次授權處理。

## 按需搭配 Web 技能

| 本次工作 | 搭配技能 |
| --- | --- |
| 鍵盤、焦點或自動無障礙檢查 | [a11y testing](../a11y-testing/SKILL.md) |
| 審查 Web 介面與互動設計 | [Web design guidelines](../web-design-guidelines/SKILL.md) |
| 載入或互動效能診斷 | [Web performance](../web-perf/SKILL.md) |

只載入符合本次問題的技能，沿用專案既有測試工具；技能範例不構成新增套件或修改測試框架的理由。瀏覽器測試不取代 LINE 手機內的 LIFF 與登入接續驗收。

## 官方入口


- [MINI App 文件](https://developers.line.biz/en/docs/line-mini-app/)：channel、開發、審核與服務訊息。
- [LIFF API](https://developers.line.biz/en/reference/liff/)：初始化、功能支援與 token。
- [LIFF 後端使用者資料](https://developers.line.biz/en/docs/liff/using-user-profile/)：可信身分傳遞。
