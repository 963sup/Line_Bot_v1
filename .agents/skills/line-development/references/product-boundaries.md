# LINE 其他產品：先定位，再開實際規格

2026-09-07 從 [官方產品入口](https://developers.line.biz/en/) 核對。這份參考提供選型與查證路徑，不代表已取得各產品帳號或完成整合驗收。

| 需求 | 官方入口與判斷 |
| --- | --- |
| 普通網站加好友、分享或按讚 | [Social Plugins](https://developers.line.biz/en/docs/line-social-plugins/)；簡單按鈕不必引入 LIFF，但點擊／加好友不是本產品會員授權。 |
| 原生 iOS／Android／Flutter 等登入 | [LINE Login SDKs](https://developers.line.biz/en/docs/line-login-sdks/)；從目前平台子頁核對維護版本、application ID、URL scheme／universal link／簽章設定及後端 token 驗證，不把 Web callback 教學直接套原生 app。 |
| 商家收款、付款確認、退款 | [LINE Pay](https://developers-pay.line.me/)；先確認區域、商家資格、API 世代、sandbox／正式環境及對應 reference。本次兩次讀取此入口逾時，未核實 endpoint 或簽章細節，不能從舊記憶生成交易呼叫。 |
| MINI App 購買或支付 | [MINI App 文件](https://developers.line.biz/en/docs/line-mini-app/) 的 Handling payments／In-app purchase；先判斷商品與平台政策、區域及資格，不假定一律 LINE Pay 或可用一般付款連結。 |
| 廣告活動與投放管理 | [Ads API](https://developers.line.biz/en/docs/line-ads-api/about/)；官方要求企業申請授權，再由頁面連至 Ad Tech／Data Provider 文件。Bot token 不代表廣告權限。 |
| LINE Tag 與服務端轉換回傳 | [Conversion API](https://conversion-api-docs.linebiz.com/en/)；同一事件的 event_name 與 deduplication_key 要一致，Tag 與 API 共用事件鍵；不把 undefined／null 字串作所有事件的鍵。 |
| Notification messages、Profile+、module／chat control 等企業選項 | [Corporate options](https://developers.line.biz/en/docs/partner-docs/)；查商務資格與專用 API，不與 MINI App service messages 或一般 push 混用。 |
| Mini Dapp／鏈上錢包 | 先從 [LINE Developers](https://developers.line.biz/en/) 定位當下官方／partner 文件並辨別服務世代；沒有 current evidence 就不推定本專案已採用，也不把會員 Coin 自動改為鏈上 token。 |

對尚未核實的產品，完成實作前先取得原頁中的必要條件、request／response、驗證方法、錯誤與重試語意。找不到或需資格的文件時明列未知，继续完成不依赖该细节的設計與現有程式盤點，不捏造能用的 API。

支付工作另外分清使用者導回、平台確認、訂單寫入、退款與對帳。瀏覽器顯示成功不等於已扣款；以實際產品規格驗證服務端結果及重複 callback，結果未知先查交易而非再收款。這是實作驗收要求，不是已查證的 LINE Pay API 流程。

轉換事件是對外資料傳輸：先確定實際業務事件、同意範圍及必要識別資訊，依 schema 做標準化與雜湊；不能因 hash 過就聲稱資料不具識別性。廣告建立、預算調整及實際交易只在明確授權內執行。
