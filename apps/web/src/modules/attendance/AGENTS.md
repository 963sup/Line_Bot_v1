# Web attendance module
## 現行 surface 與 invariant

URLs：`/attendance`、`/attendance/clock-in`、`/attendance/clock-out`、`/{login}/{repository}/settings/attendance`；API 為 `/api/attendance`、其 clock-in/clock-out 子路徑、`/api/workplaces`、`/api/internal/attendance-maintenance`。

FPT 沒有本產品出勤的直接等價 owner；不要改名成 Issue/Project。Employment cutover 依 canonical migration gates，文件中的 target 不取代 current subject contract。

`clock-in`/`clock-out` 同時影響 entry allowlist、operation display、LINE 選單與 unknown-result recovery；重構不得把明確 intent 變成依 UI 狀態猜測的 toggle。

- Repository current effective access 是打卡 participation authority；Web 不建立第二份 Workplace member list。
- Repository `admin` 才能進 scoped Attendance Location mutation；server 每次 read/write 都重新核驗。
- Owns attendance presentation and command transport；Attendance package owns geofence/session/facts，Repository package owns access。
- Clock actions submit explicit target, location, expected version and request identity where required；UI state cannot authorize or confirm success。
- Keep open/closed, rejected, unavailable, replay/conflict and unknown-result states distinguishable。
