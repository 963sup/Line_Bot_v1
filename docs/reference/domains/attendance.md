# Attendance detailed reference

Low-frequency Attendance flows and edge cases. The owner boundary and invariants remain canonical in [Attendance](../../owners/attendance.md).

## Operations

目前有打卡與補登審核 commands：

```text
clock-in  -> 建立一筆 open attendance session
clock-out -> 結束目前 open attendance session
submit-supplement -> 提出補一段完整歷史 session 或補目前 open session 的下班時間
review-supplement -> Repository 當下 effective ADMIN User 核准或拒絕一筆 pending request
```

08:00、17:00、午夜或 Rich Menu image state 都不會自動產生打卡。沒有通用 toggle；舊 UI 狀態不能反向觸發另一個 command。

## Time classification

每筆 session 保存規則版本。現行分類以 08:00、17:00 分成：

- 08:00 前
- 08:00–17:00
- 17:00 後

三類總和必須等於 session elapsed time。這些分類不是法定正常工時、加班認定、薪資或實際休息證明；目前不自動扣休息時間。

## Attendance reward

每個 session 起始 business day，成立的 clock-in / clock-out 各最多取得 0.5 Coin；同日多次 operation 不重複取得相同 source type 的 credit。

Attendance 決定：

- command 是否成立。
- reward 是否成立。
- reward business day。
- reward amount = 0.5 Coin。

Asset 定義 Coin denomination；Ledger 保存 idempotent posting；Wallet 只投影 balance。[DailyCheckIn](../../owners/daily-check-in.md) 是獨立的每日簽到 owner；既有 source context/type 的相容與保留規則由該 owner 維護，不因更名重寫 persisted literal。Attendance reward 與薪資無關；補登也不發 Coin。

## Supplement review

- 補登申請不是出勤事實；只有核准後，完整時段才會新增 closed session，或既有 open session 才會補上 ended time。
- 已有的 start time、Repository identity、point snapshot 與已結束 session 不可由補登改寫；時間重疊或原 session 已變更時拒絕核准。
- Applicant 可提交台灣時間、Repository 打卡點快照與原因；申請快照記錄提交者主張，不是當時 GPS 驗證證據。
- Reviewer 必須在讀取及決策當下都具有該 Repository 的 effective `ADMIN`。Organization-owned Repository 的有效 OrganizationOwner 由 Repository effective access 投影取得隱含 `ADMIN`；申請者不得核准自己的 request。
- 核准與出勤事實、事件、Attendance version 及 menu state projection 同 transaction。拒絕必須留下原因，不產生薪資結果。

### Review receipt disclosure

- 新審核需 active User、有效登入帳號／LINE binding 與當下 effective ADMIN；公開可見或 READ 不授權審核，也不授權讀取其他申請人的資料。
- 首次成功只回傳 `{ replayed: false }`。同一 actor、command ID 與完整 fingerprint 的重試只回傳 `{ replayed: true }`，不包含申請人、時間、地址、座標或原因。
- 撤銷 ADMIN 或全部 Repository 存取後，仍允許原操作人確認自己的精確操作結果；停用帳號／User 或 LINE binding 不符仍拒絕。同一 request ID 的不同內容仍衝突。
- 完整 durable receipt 保留在 Attendance 內部；重放必須先驗證既有 receipt 結構，損毀或缺失不能推定成功。這不授權讀取歷史申請明細。
- Web 以 owner 公開 parser 驗證最小回應後重新載入清單；申請人自己的 submission receipt 維持完整。既有頁面若仍使用舊解析器，須重新整理取得新版。

## Repository attendance-point eligibility

儲存庫可設定一個打卡點（經緯度、打卡半徑與可選地址描述）；只有座標與半徑是打卡點成立條件，不另外建立地點或地點人員名單。

- 上班需要 active User、current effective Repository access 與有效座標／半徑。描述地址為 null 不影響資格；Direct User 或同 owner scope Team grant 沿用 Repository 現行資格投影；公開可見、Star 不算成員。
- 上班符合多個地址時取最近者，同距離依 stable Repository ID；distance + accuracy 必須在 radius 內。
- 下班只驗本人 open session 的原始地址快照；移除成員或變更地址不阻擋正常下班，仍保留定位與半徑核驗。
- 新 session 保存 Repository ID 與 immutable point snapshot（描述地址可為 null）；Repository 打卡點修改或移除不改寫歷史。
- 切換前 open session 沿用其既有 clock-in event 的 site evidence，不猜測 Repository 對應、不回填成員權限。缺少原始證據時明確回報資料問題。
- 只在明確 attendance intent 後取得定位，不背景追蹤。

## Lightweight clock entry

LINE Rich Menu 可以帶明確 `clock-in` 或 `clock-out` intent 進輕量頁面。

LIFF 內首次有效 entry 可在初始化、identity/state 查詢與定位後送固定 command；外部 browser 仍需明確確認。重新整理／同頁籤重開不得自動產生第二個 command。

若送出結果未知，保留原 request ID、operation、version 與同次定位資料；明確 retry 前重新核驗目前 Member，但不能改成相反操作或重新取定位後假稱同一 command。換帳號必須清除前一 actor 的 pending state。

## External projection and notification

Attendance state 是 authority；Rich Menu 是可重試 projection。

- 沒有 open session → 期望 clock-in menu。
- 有 open session → 期望 clock-out menu。
- Menu sync failure 不回滾打卡。
- Notification delivery failure 不回滾打卡。
- Outbox / lease 必須防止舊工作永久覆蓋較新的 menu expectation。
- 已同步的 per-user menu 仍需週期性 readback；maintenance 以 current alias target 作 expected projection，只有 provider binding 不一致時才 relink，避免 Rich Menu publication 後留下舊 menu generation。
- 每次 operation 的 notification 有固定 recipient / payload / retry identity；平台接受不等於手機已送達。

LINE alias、Messaging API retry 技術細節由 LINE integration / operations owner 維護。

## Legal boundary

目前保存真實起訖與分鐘級資料，但尚未具備完整排班、休息、例假、加班核定、可稽核更正與 production retention/recovery 證據，因此不能宣稱為完整法定工時／算薪系統。Workforce 方向與缺口見 [Workforce gaps](../../change/gaps/workforce.md)。

## Retained pre-cutover data

原 workplaces、workplace_members、workplace_commands、workplace_chat_drafts、workplace_chat_events 保留資料，但撤銷 runtime 存取權。新流程不讀寫這些表，不接受原工作地點管理 API 或 LINE 建點指令。資料處置及舊地點對應儲存庫需獨立、明確的資料授權，不能由 schema deployment 猜測。
