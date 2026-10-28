# Cron 開發規格

排程是觸發機制，業務 command、授權、重播與完成判斷仍由 [對應 Owner](../../../../docs/owners/README.md) 擁有。既有 Attendance scheduler 沿用本 package 的 capability routing；本目錄不建立第二個 scheduler 或新的 job。

## 新 Job 必填契約

| 欄位 | 設計要求 |
| --- | --- |
| Owner / command | 指向既有 public capability，避免排程直接跨 Owner 寫表 |
| Schedule / timezone | 明定時區與 DST 邊界；依實際 provider 設定驗證觸發時間 |
| Occurrence identity | 同一排程時段的 retry 共用穩定 request identity |
| Concurrency | 明定重疊執行時 skip、claim 或 serialize 的選擇與理由 |
| Bounds | 單次批量、deadline、statement timeout 與資源預算 |
| Recovery | 漏跑、休眠、失敗與未知結果的補跑範圍及執行者 |
| Retention | 執行記錄保留與清理方式，不刪除仍需 replay 的證據 |

## 執行流程

Scheduler 驗證 technical credential → Owner claim occurrence → 有界處理 → 保存結果與必要 retry information。觸發成功不等於業務完成；監看 last successful occurrence、lag 與連續失敗。

Free 休眠期間不能承諾準時觸發。恢復後按 Owner 定義補跑，不用無限重試或額外 keep-alive job 代替恢復設計。

驗收：重疊觸發、同時段重播、停機漏跑、部分批次失敗、跨日／時區、credential 過期，以及 job 執行成功但業務 command 拒絕。
