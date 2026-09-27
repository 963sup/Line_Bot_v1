# Web attendance module

## GitHub Mobile 目標（後續實作）

- 本地能力保留：首頁工作捷徑 → 今日出勤狀態 → 明確 clock-in/clock-out → receipt；採緊湊狀態區與一個主要操作，地點/定位結果/時間保持可讀。
- 權限拒絕、GPS 拒絕、來源故障與 unknown result 各自提供正確下一步；不能用漂亮的成功勾號代替 receipt，也不能因返回或切 tab 再次打卡。
- 工作場所管理用列表→地點詳情/設定；未完成 Employment/歷史查詢能力不以 GitHub timeline 外觀填補。

## 現行 surface 與 invariant

Current URL：`/attendance`、`/attendance/clock-in`、`/attendance/clock-out`、`/admin/workplaces`；API 為 `/api/attendance`、其 clock-in/clock-out 子路徑、`/api/workplaces`、`/api/internal/attendance-maintenance`。

FPT 沒有本產品出勤的直接等價 owner；不要改名成 Issue/Project。`/admin/attendance` 尚未開放，不代表已接上本模組的歷史管理。Employment cutover 依 canonical migration gates，文件中的 target 不取代 current subject contract。

`clock-in`/`clock-out` 同時影響 entry allowlist、operation display、LINE 選單與 unknown-result recovery；重構不得把明確 intent 變成依 UI 狀態猜測的 toggle。

- Owns attendance presentation and command transport; attendance state, qualification, geofence and ledger effects belong to `@line-work/attendance`.
- Clock actions submit explicit target, location, expected version and request identity where required; UI state cannot authorize or confirm success.
- Keep open/closed, rejected, unavailable, replay/conflict and unknown-result states distinguishable.
