# Attendance detailed reference

Low-frequency Attendance flows and edge cases. The owner boundary and invariants remain canonical in [Attendance](attendance.md).

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

Asset 定義 Coin denomination；Ledger 保存 idempotent posting；Wallet 只投影 balance。[DailyCheckIn](daily-check-in.md) 是獨立的每日簽到 owner；既有 source context/type 的相容與保留規則由該 owner 維護，不因更名重寫 persisted literal。Attendance reward 與薪資無關；補登也不發 Coin。

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

目前保存真實起訖與分鐘級資料，但尚未具備完整排班、休息、例假、加班核定、可稽核更正與 production retention/recovery 證據，因此不能宣稱為完整法定工時／算薪系統。Workforce scope 以 Workforce、Attendance 與 Payroll current contracts 為準。

## Retained pre-cutover data

原 workplaces、workplace_members、workplace_commands、workplace_chat_drafts、workplace_chat_events 保留資料，但撤銷 runtime 存取權。新流程不讀寫這些表，不接受原工作地點管理 API 或 LINE 建點指令。資料處置及舊地點對應儲存庫需獨立、明確的資料授權，不能由 schema deployment 猜測。

## Ownership

Read this file for the Attendance owner boundary and invariants. Load [detailed reference](attendance.md) only for lifecycle / command / locator / policy details.

## Responsibility

Attendance owns clock-in / clock-out、open session invariant、time classification、Repository-point eligibility、clock reward eligibility / amount、supplement requests/reviews、write replay/version 與 attendance-derived menu/notification expectations。Asset denomination、Wallet balance 與 durable Ledger history 由各自 owner 定義；LINE delivery、LIFF runtime 與 deployment 不屬本 module business authority。

## Session invariants

- 同一 current User 最多一筆未結束 session。
- Session 不重疊，end 不早於 start；同日可以多次 clock-in/out。
- Server 保存 UTC time point；display / business day 使用 Asia/Taipei。
- 跨日 session 只是一筆 session；按每日實際相交時間分類，不重複累計。
- 未結束 session 只顯示截至 query `computedAt` 的暫計。

## Command safety

Write command 帶 stable request UUID、`expectedVersion` 與定位 payload。Actor / server time 由 server 決定。

- Version conflict → 拒絕，不覆寫新狀態。
- Same request ID + same command → 回 durable receipt，不重複 session、Ledger credit、event 或 notification。
- Same request ID + different content → conflict。
- Transaction 內重新核驗 current User qualification 與 Repository-address eligibility。
- Session state、version、event、Ledger credit、receipt 與必要 outbox expectation 同 transaction commit/rollback；value persistence 不拆成遠端 service call。

Browser `sessionStorage` 只能協助 UX 恢復；server receipt/version/state 才是 authority。

## Supplement requests

- User 只能提出補登，不可直接建立或改寫 Attendance session。
- MVP 支援兩種提案：新增一段完整的已結束歷史 session；或替自己的未結束 Repository session 提出下班時間。第二種核准只做單向 close，不改上班時間、Repository 或地址快照。
- 補登地點取自申請時保存的 Repository point snapshot（含可為 null 的描述）；它是申請與人工審核內容，不代表系統驗證了歷史 GPS 位置。
- Repository 當下有效的 `ADMIN` User 才能看到待審核項目並核准／拒絕。Organization-owned Repository 的有效 OrganizationOwner 由 Repository effective access 投影取得隱含 `ADMIN`；決策時仍重新驗證，申請者不得審核自己。
- 申請人不能核准自己的補登。拒絕必須記錄理由；每一決定重驗當下 Repository permission、stable command identity 與 request version。
- 核准建立/結束出勤事實、追加事件、更新版本、留下審核者與更新必要 menu state 同 transaction commit/rollback。拒絕只結束 request 並追加事件。
- 補登不發 Ledger 打卡獎勵，也不計算薪資；正式薪資由後續範圍處理。

審核回應與重試只公開最小操作收據；資格與資料揭露規則見 [Supplement review](attendance.md#supplement-review)。本人提交申請的完整收據與 clock-out 原始快照契約維持。

## Qualification

- Account/User 提供 current active human qualification，每次操作重新驗證。
- 上班以 Repository 座標與半徑作打卡點；描述地址可為 null，不參與資格判定。仍須有 current effective access；公開可見或 Star 不授權。
- 核驗以打卡當下座標、GPS 精度與半徑計算；地址文字只供辨識，不替代定位證據。
- 下班使用該筆出勤的原始 point snapshot。移除成員、移除或修改 Repository 打卡點不阻擋本人正常下班，但不授予新上班資格。
- Repository 擁有座標、半徑、可選描述與打卡點維護授權；Attendance 擁有出勤、定位核驗、快照與結果。
- 舊 Workplace 管理 API、Web 與 LINE 聊天建立流程已移除。原表只保留歷史資料，runtime 不再讀寫；不得由舊名單推導 Repository access。
