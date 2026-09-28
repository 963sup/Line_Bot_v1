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

## Workplace eligibility

Clock command 需要目前 active Member、可用 Workplace membership 與定位證據。

- Workplace 可有多位 Member；Member 可有多個允許地點。
- 上／下班都可在本人任一獲准且 active 的 Workplace 完成。
- Server 以 Haversine distance + reported accuracy 驗證半徑；多個符合地點取最近者，同距離按 stable ID。
- 沒有獲准地點、定位失敗或越界時拒絕寫入。
- 只在明確 attendance intent 後取得定位，不背景追蹤。
- 成功事件保存當時 workplace ID/version/name/geometry/radius evidence；目前地點設定不能改寫歷史證據。

Workplace management permission 不等於本人打卡資格；WorkGroup role、LINE groupId 也不授予 workplace access。

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

## Workplace chat flow

本流程讓具全域 `workplaces.manage` 權限的管理者透過 LINE 私聊建立打卡地點。它是 Attendance / Workplace 業務流程；LINE adapter 只提供訊息、location event 與 reply transport。

## Flow

1. 管理者以明確指令開始新增地點並提供名稱。
2. 使用 LINE 原生 location action 選擇位置。
3. 選擇 50 / 100 / 200 公尺或輸入合法半徑。
4. 顯示確認內容。
5. 只有明確確認時才建立正式 Workplace。

新增成功不自動讓任何 human subject 取得可打卡資格；Workplace eligibility 必須另行配置。

## Lifecycle

同一 current human actor 同時最多一個進行中 flow。Flow 約 15 分鐘有效，可以取消、重新選點，或透過明確恢復指令回到最新合法步驟。15 分鐘是操作有效期，不是 audit/event retention policy。

## Durable behavior

Draft/event state 位於 private persistence。Versioned interaction 拒絕舊 button/stale step；event receipt 支援 transport replay protection。

最終確認沿用正式 Workplace command，Workplace 建立與 flow result 在同一 authoritative transaction 提交。LINE reply 在 transaction 外：reply failure 不回滾已建立的 Workplace，也不自動改用另一種 side effect。

## Location semantics

LINE location event 只代表管理者選擇 Workplace 座標，不是某員工實際到場的 GPS attendance evidence。Attendance clock operation 仍須在本人明確打卡時取得並驗證定位。
