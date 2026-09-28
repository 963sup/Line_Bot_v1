# 技能選路與決策驗證情境

更新 LINE 技能後，以相關情境檢查描述、可發現的參考檔與最終決策。這是可重用的驗證案例，不是已執行測試紀錄。文件閱讀核對、獨立代理試作、mock 測試與真實 LINE 實測需分別報告。

| 輸入情境 | 選路與可觀察的正確結果 |
| --- | --- |
| Bot 與 MINI App 的 userId 不同，要搬 channel 到另一 Provider | 平台參考；先查 Provider，指出 channel 不能移動，不自動合併會員。 |
| Push timeout，要求換 retry key 再送一次 | Sending；保留首送鍵／payload，辨別結果未知，不造成第二個邏輯發送。 |
| Reply 收到失敗，想套 X-Line-Retry-Key | Sending；識別不支援端點，查 token／原結果，不直接改 push。 |
| 一個 request 含四張卡片送五人，算幾則方案訊息 | Sending／pricing；依收件人與方法計算，不算成四則或二十則；地區報價另查。 |
| 更換 default rich menu 後仍看到舊分頁 | Rich menus；檢查 per-user link 與 alias，不先刪除全部 menu。 |
| 影片 carousel 在 Simulator 看不到播放 | Flex；辨識 video 結構不合法與 Simulator 播放限制是不同問題。 |
| liff.ready 一直 loading，init 已失敗 | LIFF runtime；處理 init rejection，不只給 ready 加重試。 |
| Init 前先清 query，深連結登入壞了 | LIFF runtime；檢查 liff.*／primary redirect 保留，不關閉驗證。 |
| 手機關閉 LIFF 後，拿舊 token 當永久會員證明 | Login／runtime；分開 token 與持久會員映射，重新核驗。 |
| 原生 account linking 過期且沒有 Webhook | Account linking；容許過期無事件，安全重新開始，不將 redirect 判成功。 |
| 想從 unverified Published MINI App 發優惠券服務訊息 | Release／service messages；指出資格與用途兩個問題，不強行發送。 |
| Review 正常，Published audience 驗證失敗 | Release；核對各自 LIFF ID／channel／endpoint，不接受所有 audience。 |
| LINE Tag 與 Conversion API 同時回傳購買 | Product boundaries；同事件共用有效 deduplication key，不為每條傳輸生成不同鍵。 |
| 只要普通網站加好友按鈕 | Social Plugins 路徑；不新增 bot server 或整個 LIFF app。 |
| 修一個普通 React 按鈕顏色，沒有 LINE 特有行為 | 不載入整個 LINE 跨產品技能組。 |

通過門檻：選到相關入口、找到實際依據、保留任務範圍、不混淆憑證或完成狀態。真正行為驗證要保存實際輸入、輸出與觀察；有新反例才補窄規則，不為每個案例新增獨立 skill。
