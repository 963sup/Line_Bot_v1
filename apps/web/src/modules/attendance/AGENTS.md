# Web attendance module
## 現行 surface 與 invariant
URLs：`/attendance`、`/attendance/clock-in`、`/attendance/clock-out`；API 為 `/api/attendance`、其 clock-in/clock-out 子路徑、`/api/internal/attendance-maintenance`。

FPT 沒有本產品出勤的直接等價 owner；不要改名成 Issue/Project。儲存庫地址是打卡點；成員資格由 Repository 提供。下班沿用本人原出勤地址快照，不依賴 current Repository access。Employment cutover 依 canonical migration gates，文件中的 target 不取代 current subject contract。

`clock-in`/`clock-out` 同時影響 entry allowlist、operation display、LINE 選單與 unknown-result recovery；重構不得把明確 intent 變成依 UI 狀態猜測的 toggle。

- Owns attendance presentation and command transport; attendance state, qualification, geofence and ledger effects belong to `@line_bot_v1/attendance`.
- Clock actions submit explicit target, location, expected version and request identity where required; UI state cannot authorize or confirm success.
- Keep open/closed, rejected, unavailable, replay/conflict and unknown-result states distinguishable.
