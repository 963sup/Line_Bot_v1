# Web Rich Menu module


## 現行 surface 與 invariant

URL consumer：既有 definition/entry intent 連到 app 正式入口；本目錄不擁有新 Web URL。調整時核對 [App URL 契約](../../../app/AGENTS.md)、LIFF allowlist、login continuation、發布來源 revision 與遠端綁定 readback。

FPT 不定義 LINE Rich Menu；資源語意可對照，發布行為依 LINE channel 與本地 release 契約。不要把文件更新、Git push 或圖片存在當成已發布／實機驗收。

- Owns product menu definition, desired state, publication policy and operator-facing evidence; LINE channel owns only protocol/client behavior.
- Publish `attendance-in`, `attendance-out`, `forms`, `incident`, `notifications`, and `team`; default uses `attendance-in`. The four submenus use native switching and an `attendance-menu` Back postback. Forms exposes the four user-supplied external Google Forms; other submenu feature buttons stay inactive. External form submission does not mutate local business state. Do not create duplicated in/out submenu variants.
- User-menu reconciliation owns presentation selection and provider readback: preserve the currently browsed submenu during maintenance, migrate it to its current alias, and use authoritative Attendance state for explicit Back. It does not own Attendance business state.
- Preview is repository-only and read-only. Publish requires exact source revision, preflight, explicit authorization, remote mutation and readback.
- Menu visibility/navigation never authorizes business operations and must not claim mobile/device acceptance without separate evidence.
