# Web diary module


## 現行 surface 與 invariant

Current URL：`/diary`；目前只有外部表單入口設定，沒有本地 Diary persistence/query API。FPT 無直接對應；不得從檔案名稱推導已完成日誌 read projection。

修改表單入口需核對頁面與 LINE 選單 consumer；`/history` 尚未提供日誌查詢，外部表單存在不代表本地有歷史資料或存取權。

- Owns the current external diary form entry only; future read projections require an explicit owner contract and must not become a second source for attendance, Issue or notification facts.
- Cross-owner data is consumed through public projections/contracts with explicit scope and freshness/status semantics.
- Missing, partial and unavailable source data must not be rendered as authoritative empty history.
