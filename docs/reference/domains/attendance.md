# Attendance detailed reference

Low-frequency Attendance flows and edge cases. The owner boundary and invariants remain canonical in [Attendance](../../owners/attendance.md).

## Operations

目前只有兩個明確 business commands：

```text
clock-in  -> 建立一筆 open attendance session
clock-out -> 結束目前 open attendance session
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

Asset 定義 Coin denomination；Ledger 保存 idempotent posting；Wallet 只投影 balance。[DailyCheckIn](../../owners/daily-check-in.md) 是獨立的每日簽到 owner；既有 source context/type 的相容與保留規則由該 owner 維護，不因更名重寫 persisted literal。Attendance reward 與薪資無關。

## Repository-scoped Workplace eligibility

Repository access 是 clock participation 的唯一 authority。

- User 必須是 current active User，且對目標 Repository 有 current effective access。
- direct Repository access 與 Team-derived access 都由 Repository owner 的 current projection 計算；Attendance 不另存 Workplace member list。
- Workplace id 等於 Repository id；每個 Repository 最多一個 configured Workplace。
- 上／下班都只能在本人有 current access 且已啟用的 Repository Workplace 完成。
- Server 以 Haversine distance + reported accuracy 驗證半徑；多個符合地點取最近者，同距離按 stable Repository id。
- 沒有可用 Repository Workplace、定位失敗或越界時拒絕寫入。
- 只在明確 attendance intent 後取得定位，不背景追蹤。
- 成功事件保存當時 Workplace id/version/name/geometry/radius evidence；目前設定不能改寫歷史證據。
- current Repository `admin` capability 才能修改 Location；普通 Repository access 只代表可以參與打卡，不授予管理能力。

## Lightweight clock entry

LINE Rich Menu 可以帶明確 `clock-in` 或 `clock-out` intent 進輕量頁面。

LIFF 內首次有效 entry 可在初始化、identity/state 查詢與定位後送固定 command；外部 browser 仍需明確確認。重新整理／同頁籤重開不得自動產生第二個 command。

若送出結果未知，保留原 request ID、operation、version 與同次定位資料；明確 retry 前重新核驗目前 User 與 Repository access，但不能改成相反操作或重新取定位後假稱同一 command。換帳號必須清除前一 actor 的 pending state。

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

