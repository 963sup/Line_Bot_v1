# MINI App 環境、審核與服務訊息

来源核對：2026-09-07。資格、地區、審核時程及限制於操作時重新核對。

## 發布前辨識環境

依 [Console guide](https://developers.line.biz/en/docs/line-mini-app/discover/console-guide/)，Developing／Review／Published 是不同內部 channel，各有 LIFF ID、endpoint 與憑證。記下啟動網址、init LIFF ID、後端預期 audience 與 channel token 是否一致。

一般使用者無法使用開發者限定入口時，先核對 tester 資格及分享的環境；不可直接放寬產品授權。部署 Review 的網頁不會自動證明 Published 網頁相同，審核會複製的 Console 設定與自行部署的程式分開驗證。

依 [Submission guide](https://developers.line.biz/en/docs/line-mini-app/submit/submission-guide/)，台灣／泰國的 verification review 目前需 certified provider；新建 channel 不等於 verified MINI App。審核通過、設定反映、公開搜尋及自身網站部署不是同一狀態。

提交前備齊實際測試帳號／情境、服務描述、圖示與必要政策，Review／Published 應反映相同服務。首次通過與更新版本的發布流程不同，且有自動啟用／反映期限；查當次 Console 狀態與官方日期規則，不能承諾可以永久停留在「審核通過但未發布」。既有發布授權已明確時繼續完成，不重新要求一輪泛用確認。

## 服務訊息

依 [Service messages](https://developers.line.biz/en/docs/line-mini-app/develop/service-messages/)：

- 僅作 MINI App 使用者操作的確認或後續回應，不能用來發促銷、優惠券或廣告。它出現在地區性的 MINI App 通知聊天室，不是自己的 bot push。
- Verified MINI App 才能於 Published 使用；unverified 可在 Developing 測試。選官方 template、核對審核狀態、語言與必填 params。
- 以當前 LIFF access token 與對應內部 channel access token 簽發 service notification token。MINI App 支援 stateless／short-lived，推薦 stateless；不支援 Bot long-lived 或 channel token v2.1。
- 每次發送後保存回應提供的新 notification token 及剩餘次數，後續用新值。以實際 API 回應及期限判定可否續送，不能重複用舊 token 當任意通知額度。
- 同一業務操作的並行通知需按既有狀態儲存方式協調 token 更新，避免覆蓋新值；這是應用端一致性要求。逾時先依 Service Message API 查可恢復方式，不能挪用 Messaging API retry header。

產出 templateName、params、動作關聯及永久連結；未有真實發送授權就先交付可檢閱內容。測試錯環境、template 未核准、缺參數、token 過期／耗盡、重複觸發及發送後 token 更新。Console Send test 也是真實發送，不把預覽成功當交付成功。
